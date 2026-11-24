import { lerFarmaciasPfpb, URL_PLANILHA_PFPB } from './fontes/pfpb.js';
import { listarEstadosIbge, listarMunicipiosIbge, indexarMunicipios } from './fontes/ibge.js';
import { coordenadasCnesPorCnpj } from './fontes/cnes.js';
import { geocodificarNominatim } from './fontes/nominatim.js';
import { coordenadaValida, cruzar } from './cruzamento.js';
import { idMunicipio, normalizar } from './texto.js';

const LIMITE_FALHAS_SEGUIDAS = 3;

/**
 * Orquestra a extração: planilha -> filtro -> IBGE -> CNES -> cruzamento.
 * As fontes externas vêm por parâmetro para poderem ser simuladas nos testes.
 */
export async function extrair(planilha, filtro = {}, fontes = {}) {
  const {
    listarEstados = listarEstadosIbge,
    listarMunicipios = listarMunicipiosIbge,
    coordenadasCnes = coordenadasCnesPorCnpj,
    geocodificar = geocodificarNominatim,
    log = console.log,
  } = fontes;

  const todasLinhas = await lerFarmaciasPfpb(planilha);
  log(`Planilha: ${todasLinhas.length} farmácias.`);

  let linhas = todasLinhas;
  if (filtro.uf) linhas = linhas.filter((f) => f.uf === filtro.uf);
  if (filtro.municipio) linhas = linhas.filter((f) => normalizar(f.municipio) === normalizar(filtro.municipio));
  if (!linhas.length) throw new Error('Nenhuma farmácia após o filtro. Confira --uf e --municipio.');

  // Uma UF fora do padrão abortaria a consulta ao IBGE ou invalidaria a importação inteira
  const ufs = [...new Set(linhas.map((f) => f.uf))].filter((uf) => /^[A-Z]{2}$/.test(uf)).sort();

  // A importação remove quem não está nesta lista, por isso ela cobre a planilha inteira: a farmácia pode ter mudado de UF
  const credenciadas = [...new Set(todasLinhas.map((f) => f.cnpj))];
  const sincronizacao = { ufs, credenciadas };

  // Antes das consultas demoradas, para uma falha do IBGE não descartar o que elas obtiveram
  const todosEstados = await listarEstados();

  // Resolve cada linha para o município oficial do IBGE
  for (const uf of ufs) {
    const indice = indexarMunicipios(await listarMunicipios(uf));
    for (const f of linhas.filter((l) => l.uf === uf)) {
      f.municipioIbge = indice.achar(f);
    }
  }
  const resolvidas = linhas.filter((f) => f.municipioIbge);
  const naoResolvidas = linhas.filter((f) => !f.municipioIbge);
  if (naoResolvidas.length) log(`Aviso: ${naoResolvidas.length} farmácias com município não reconhecido no IBGE.`);

  // Busca as coordenadas no CNES, um município por vez
  const codigos = [...new Set(resolvidas.map((f) => f.municipioIbge.codigo))];
  const coordenadasPorMunicipio = new Map();
  let falhasSeguidasCnes = 0;
  for (const [i, codigo] of codigos.entries()) {
    log(`CNES ${i + 1}/${codigos.length}: município ${codigo}`);
    try {
      coordenadasPorMunicipio.set(codigo, await coordenadasCnes(codigo));
      falhasSeguidasCnes = 0;
    } catch (erro) {
      log(`Aviso: falha ao consultar o CNES para o município ${codigo}: ${erro.message}`);
      falhasSeguidasCnes++;
      if (falhasSeguidasCnes === LIMITE_FALHAS_SEGUIDAS) {
        log(`Aviso: consulta ao CNES interrompida após ${LIMITE_FALHAS_SEGUIDAS} falhas seguidas.`);
        break;
      }
    }
  }

  const { comCoordenada, semCoordenada: semCoordenadaCnes, naoConsultadas } = cruzar(resolvidas, coordenadasPorMunicipio);
  const viaCnes = comCoordenada.length;
  const falhas = { cnes: naoConsultadas.length, openStreetMap: 0 };

  // Quem ficou sem coordenada no CNES tenta a geocodificação pelo endereço
  const semCoordenada = [];
  const geocodificadas = [];
  if (filtro.geocodificar !== false) {
    let falhasSeguidas = 0;
    for (const [i, f] of semCoordenadaCnes.entries()) {
      let ponto;
      let falhou = falhasSeguidas === LIMITE_FALHAS_SEGUIDAS;
      if (!falhou) {
        log(`Geocodificando ${i + 1}/${semCoordenadaCnes.length}: ${f.nome}`);
        try {
          ponto = await geocodificar(f);
          falhasSeguidas = 0;
        } catch (erro) {
          falhou = true;
          log(`Aviso: falha ao geocodificar ${f.nome}: ${erro.message}`);
          falhasSeguidas++;
          if (falhasSeguidas === LIMITE_FALHAS_SEGUIDAS) {
            log(`Aviso: geocodificação interrompida após ${LIMITE_FALHAS_SEGUIDAS} falhas seguidas.`);
          }
        }
      }

      if (falhou) {
        falhas.openStreetMap++;
        semCoordenada.push({ ...f, motivo: `${f.motivo}; falha ao consultar o OpenStreetMap` });
      } else if (ponto && coordenadaValida(ponto.latitude, ponto.longitude)) {
        comCoordenada.push({
          id: f.cnpj,
          nome: f.nome,
          endereco: f.endereco,
          bairro: f.bairro,
          municipioId: idMunicipio(f.uf, f.municipio),
          latitude: ponto.latitude,
          longitude: ponto.longitude,
        });
        geocodificadas.push({ cnpj: f.cnpj, nome: f.nome, endereco: f.endereco, bairro: f.bairro, municipio: f.municipio, precisao: ponto.precisao, latitude: ponto.latitude, longitude: ponto.longitude });
      } else {
        semCoordenada.push({ ...f, motivo: `${f.motivo}; endereço não localizado no OpenStreetMap` });
      }
    }
  } else {
    semCoordenada.push(...semCoordenadaCnes);
  }

  if (!comCoordenada.length && (falhas.cnes || falhas.openStreetMap)) {
    const fontesComFalha = [falhas.cnes && 'o CNES', falhas.openStreetMap && 'o OpenStreetMap'].filter(Boolean).join(' e ');
    throw new Error(`Nenhuma farmácia ficou com coordenada e houve falha ao consultar ${fontesComFalha}. Nada foi gravado; tente de novo mais tarde.`);
  }

  // Sem geocodificação: no banco, a precisão de rua substituiria uma coordenada do CNES
  semCoordenada.push(...naoConsultadas);

  for (const f of naoResolvidas) {
    semCoordenada.push({ cnpj: f.cnpj, nome: f.nome, endereco: f.endereco, bairro: f.bairro, uf: f.uf, municipio: f.municipio, motivo: 'município não reconhecido no IBGE' });
  }

  // Estados e municípios que têm ao menos uma farmácia com coordenada
  const ufsComFarmacia = new Set(comCoordenada.map((f) => f.municipioId.slice(0, 2).toUpperCase()));
  const estados = todosEstados.filter((e) => ufsComFarmacia.has(e.sigla));

  const municipiosPorId = new Map();
  for (const f of resolvidas) {
    const id = idMunicipio(f.uf, f.municipioIbge.nome);
    if (comCoordenada.some((c) => c.municipioId === id)) {
      municipiosPorId.set(id, { id, nome: f.municipioIbge.nome, uf: f.uf });
    }
  }
  const municipios = [...municipiosPorId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const total = comCoordenada.length + semCoordenada.length;
  const metadados = {
    fonte: URL_PLANILHA_PFPB,
    coordenadas: 'CNES (apidadosabertos.saude.gov.br), cruzado pelo CNPJ; o restante geocodificado pelo endereço no OpenStreetMap (Nominatim)',
    extraidoEm: new Date().toISOString(),
    filtro,
    totalFarmacias: total,
    comCoordenada: comCoordenada.length,
    viaCnes,
    viaGeocodificacao: geocodificadas.length,
    semCoordenada: semCoordenada.length,
    falhas,
    cobertura: total ? Number(((comCoordenada.length / total) * 100).toFixed(1)) : 0,
  };

  return { estados, municipios, farmacias: comCoordenada, semCoordenada, geocodificadas, metadados, sincronizacao };
}
