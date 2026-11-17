import { idMunicipio } from './texto.js';

/** Coordenada dentro do território brasileiro e diferente de zero. */
export function coordenadaValida(lat, lng) {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat !== 0 && lng !== 0 &&
    lat >= -34 && lat <= 6 && lng >= -74 && lng <= -28
  );
}

/**
 * Junta as farmácias da planilha com as coordenadas do CNES pelo CNPJ.
 * Devolve as farmácias no formato do contrato e as que ficaram sem coordenada.
 * @param {Array} farmacias linhas da planilha já com `municipioIbge` ({ codigo, nome })
 * @param {Map<string, Map>} coordenadasPorMunicipio código IBGE -> (CNPJ -> coordenada)
 */
export function cruzar(farmacias, coordenadasPorMunicipio) {
  const comCoordenada = [];
  const semCoordenada = [];
  const vistos = new Set();

  for (const f of farmacias) {
    if (vistos.has(f.cnpj)) continue; // a planilha pode repetir o CNPJ
    vistos.add(f.cnpj);

    const coordenada = coordenadasPorMunicipio.get(f.municipioIbge.codigo)?.get(f.cnpj);
    const lat = Number(coordenada?.latitude);
    const lng = Number(coordenada?.longitude);

    if (coordenada && coordenadaValida(lat, lng)) {
      comCoordenada.push({
        id: f.cnpj,
        nome: f.nome,
        endereco: f.endereco,
        bairro: f.bairro,
        municipioId: idMunicipio(f.uf, f.municipioIbge.nome),
        latitude: lat,
        longitude: lng,
      });
    } else {
      semCoordenada.push({
        cnpj: f.cnpj,
        nome: f.nome,
        endereco: f.endereco,
        bairro: f.bairro,
        uf: f.uf,
        municipio: f.municipioIbge.nome,
        motivo: coordenada ? 'coordenada inválida no CNES' : 'CNPJ não encontrado no CNES',
      });
    }
  }
  return { comCoordenada, semCoordenada };
}
