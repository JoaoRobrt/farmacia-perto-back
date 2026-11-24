import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { extrair } from '../src/extrair.js';

const PASTA_EXTRATOR = resolve(fileURLToPath(new URL('..', import.meta.url)));

const COORDENADA = { latitude: -7.2176, longitude: -35.8844 };
const PONTO_OSM = { latitude: -7.1, longitude: -35.9, precisao: 'house' };

const cnpj = (n) => String(n).padStart(14, '0');
const nomeDe = (n) => `Farmácia ${cnpj(n)}`;
const codigoDe = (cidade) => String(2500000 + cidade);
const MUNICIPIOS = [1, 2, 3, 4, 5].map((n) => ({ codigo: codigoDe(n), nome: `Cidade ${n}` }));

const MOTIVO_CNES = 'falha ao consultar o CNES';
const MOTIVO_AUSENTE_E_OSM = 'CNPJ não encontrado no CNES; falha ao consultar o OpenStreetMap';

// Cada linha é [número da cidade, número do CNPJ]
async function planilha(linhas) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  for (const [cidade, n] of linhas) {
    aba.addRow(['PB', `CIDADE ${cidade}`, cnpj(n), nomeDe(n), `Rua ${n}`, 'Centro']);
  }
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const mapaCnes = (...numeros) => new Map(numeros.map((n) => [cnpj(n), COORDENADA]));

// Fontes sem falha: nenhum município tem farmácia no CNES e o endereço nunca é localizado
function fontes(sobrescritas = {}) {
  return {
    listarEstados: async () => [{ sigla: 'PB', nome: 'Paraíba' }],
    listarMunicipios: async () => MUNICIPIOS,
    coordenadasCnes: async () => new Map(),
    geocodificar: async () => undefined,
    log: () => {},
    ...sobrescritas,
  };
}

// Responde por posição da chamada: uma função rejeita, qualquer outro valor é devolvido
function sequencia(respostas, chamadas) {
  return async (arg) => {
    const resposta = respostas[chamadas.length];
    chamadas.push(arg);
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
}

const falha = (mensagem = 'fonte fora do ar') => new Error(mensagem);

// Cidade 1 com a farmácia 1 no CNES e a 2 ausente; Cidade 2, com as farmácias 3 e 4, falha no CNES
const LINHAS_DOIS_MUNICIPIOS = [[1, 1], [1, 2], [2, 3], [2, 4]];
const cnesComFalhaNaCidade2 = async (codigo) => {
  if (codigo === codigoDe(2)) throw falha('CNES fora do ar');
  return mapaCnes(1);
};

test('CA1: falha do OpenStreetMap em uma farmácia ausente do CNES não impede localizar a outra', async () => {
  const geocodificar = async (f) => {
    if (f.cnpj === cnpj(2)) throw falha();
    return PONTO_OSM;
  };
  const r = await extrair(
    await planilha([[1, 1], [1, 2], [1, 3]]),
    {},
    fontes({ coordenadasCnes: async () => mapaCnes(1), geocodificar }),
  );
  assert.deepEqual(r.farmacias.map((f) => f.id).sort(), [cnpj(1), cnpj(3)]);
  const afetada = r.semCoordenada.find((f) => f.cnpj === cnpj(2));
  assert.equal(afetada.motivo, MOTIVO_AUSENTE_E_OSM);
  assert.equal(r.semCoordenada.length, 1);
});

test('CA2: falha do OpenStreetMap em farmácia com coordenada zerada no CNES usa o motivo de coordenada inválida', async () => {
  const geocodificar = async (f) => {
    if (f.cnpj === cnpj(2)) throw falha();
    return PONTO_OSM;
  };
  const cnes = new Map([
    [cnpj(1), COORDENADA],
    [cnpj(2), { latitude: 0, longitude: 0 }],
  ]);
  const r = await extrair(
    await planilha([[1, 1], [1, 2], [1, 3]]),
    {},
    fontes({ coordenadasCnes: async () => cnes, geocodificar }),
  );
  assert.deepEqual(r.farmacias.map((f) => f.id).sort(), [cnpj(1), cnpj(3)]);
  assert.equal(r.semCoordenada.find((f) => f.cnpj === cnpj(2)).motivo, 'coordenada inválida no CNES; falha ao consultar o OpenStreetMap');
});

test('CA3: falha do CNES em um município mantém as farmácias do outro e move as do que falhou para semCoordenada', async () => {
  const r = await extrair(await planilha(LINHAS_DOIS_MUNICIPIOS), {}, fontes({ coordenadasCnes: cnesComFalhaNaCidade2 }));
  assert.deepEqual(r.farmacias.map((f) => f.id), [cnpj(1)]);
  for (const n of [3, 4]) {
    const item = r.semCoordenada.find((f) => f.cnpj === cnpj(n));
    assert.equal(item.motivo, MOTIVO_CNES, cnpj(n));
    assert.equal(item.municipio, 'Cidade 2');
  }
  assert.deepEqual(r.municipios.map((m) => m.id), ['pb-cidade-1']);
});

test('CA4: farmácias do município que falhou no CNES não são enviadas ao geocodificador', async () => {
  const consultadas = [];
  const geocodificar = async (f) => {
    consultadas.push(f.cnpj);
    return undefined;
  };
  await extrair(await planilha(LINHAS_DOIS_MUNICIPIOS), {}, fontes({ coordenadasCnes: cnesComFalhaNaCidade2, geocodificar }));
  assert.deepEqual(consultadas, [cnpj(2)]);
});

test('CA5: com falha do CNES, todas as CNPJs ficam em credenciadas e ufs é a de uma extração sem falha', async () => {
  const comFalha = await extrair(await planilha(LINHAS_DOIS_MUNICIPIOS), {}, fontes({ coordenadasCnes: cnesComFalhaNaCidade2 }));
  const semFalha = await extrair(await planilha(LINHAS_DOIS_MUNICIPIOS), {}, fontes({ coordenadasCnes: async (c) => (c === codigoDe(1) ? mapaCnes(1) : new Map()) }));
  assert.deepEqual([...comFalha.sincronizacao.credenciadas].sort(), [1, 2, 3, 4].map(cnpj));
  assert.deepEqual(comFalha.sincronizacao.ufs, semFalha.sincronizacao.ufs);
  assert.deepEqual(comFalha.sincronizacao.ufs, ['PB']);
});

test('CA5: com falha do OpenStreetMap, todas as CNPJs ficam em credenciadas e ufs é a de uma extração sem falha', async () => {
  const linhas = [[1, 1], [1, 2], [1, 3]];
  const base = { coordenadasCnes: async () => mapaCnes(1) };
  const comFalha = await extrair(await planilha(linhas), {}, fontes({ ...base, geocodificar: async () => { throw falha(); } }));
  const semFalha = await extrair(await planilha(linhas), {}, fontes(base));
  assert.deepEqual([...comFalha.sincronizacao.credenciadas].sort(), [1, 2, 3].map(cnpj));
  assert.deepEqual(comFalha.sincronizacao.ufs, semFalha.sincronizacao.ufs);
});

test('CA6: com geocodificar: false o resultado é o do CA3, sem chamar o geocodificador, e falhas.cnes conta as farmácias do município', async () => {
  let chamadas = 0;
  const geocodificar = async () => {
    chamadas++;
    return PONTO_OSM;
  };
  const r = await extrair(
    await planilha(LINHAS_DOIS_MUNICIPIOS),
    { geocodificar: false },
    fontes({ coordenadasCnes: cnesComFalhaNaCidade2, geocodificar }),
  );
  assert.equal(chamadas, 0);
  assert.deepEqual(r.farmacias.map((f) => f.id), [cnpj(1)]);
  assert.deepEqual(r.semCoordenada.filter((f) => f.motivo === MOTIVO_CNES).map((f) => f.cnpj), [cnpj(3), cnpj(4)]);
  assert.deepEqual(r.metadados.falhas, { cnes: 2, openStreetMap: 0 });
});

test('CA7: depois de 3 falhas seguidas o CNES não é mais consultado e as farmácias restantes recebem o motivo de falha', async () => {
  const consultados = [];
  const coordenadasCnes = async (codigo) => {
    consultados.push(codigo);
    if (codigo === codigoDe(1)) return mapaCnes(1);
    throw falha();
  };
  const r = await extrair(await planilha([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]), {}, fontes({ coordenadasCnes }));
  assert.deepEqual(consultados, [1, 2, 3, 4].map(codigoDe));
  assert.deepEqual(r.semCoordenada.map((f) => [f.cnpj, f.motivo]), [2, 3, 4, 5].map((n) => [cnpj(n), MOTIVO_CNES]));
  assert.deepEqual(r.farmacias.map((f) => f.id), [cnpj(1)]);
});

test('CA8: depois de 3 falhas seguidas o geocodificador não é mais chamado e as 5 farmácias recebem o motivo de falha', async () => {
  let chamadas = 0;
  const geocodificar = async () => {
    chamadas++;
    throw falha();
  };
  const r = await extrair(
    await planilha([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]),
    {},
    fontes({ coordenadasCnes: async () => mapaCnes(1), geocodificar }),
  );
  assert.equal(chamadas, 3);
  assert.deepEqual(r.semCoordenada.map((f) => [f.cnpj, f.motivo]), [2, 3, 4, 5, 6].map((n) => [cnpj(n), MOTIVO_AUSENTE_E_OSM]));
});

test('CA9: um sucesso entre falhas do CNES zera a contagem e as 5 consultas são feitas', async () => {
  const chamadas = [];
  const coordenadasCnes = sequencia([falha(), falha(), mapaCnes(3), falha(), falha()], chamadas);
  const r = await extrair(await planilha([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]), {}, fontes({ coordenadasCnes }));
  assert.deepEqual(chamadas, [1, 2, 3, 4, 5].map(codigoDe));
  assert.deepEqual(r.farmacias.map((f) => f.id), [cnpj(3)]);
  assert.deepEqual(r.metadados.falhas, { cnes: 4, openStreetMap: 0 });
});

test('CA9: um endereço não localizado entre falhas do OpenStreetMap zera a contagem e as 5 consultas são feitas', async () => {
  const chamadas = [];
  const geocodificar = sequencia([falha(), falha(), undefined, falha(), falha()], chamadas);
  const r = await extrair(
    await planilha([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6]]),
    {},
    fontes({ coordenadasCnes: async () => mapaCnes(1), geocodificar }),
  );
  assert.equal(chamadas.length, 5);
  const motivos = Object.fromEntries(r.semCoordenada.map((f) => [f.cnpj, f.motivo]));
  assert.equal(motivos[cnpj(4)], 'CNPJ não encontrado no CNES; endereço não localizado no OpenStreetMap');
  for (const n of [2, 3, 5, 6]) assert.equal(motivos[cnpj(n)], MOTIVO_AUSENTE_E_OSM, cnpj(n));
  assert.deepEqual(r.metadados.falhas, { cnes: 0, openStreetMap: 4 });
});

test('CA10: falha da lista de estados interrompe a extração com a mensagem original antes de consultar o CNES e o OpenStreetMap', async () => {
  let chamadas = 0;
  const contar = async () => {
    chamadas++;
    return new Map();
  };
  await assert.rejects(
    extrair(await planilha([[1, 1], [1, 2]]), {}, fontes({
      listarEstados: async () => { throw falha('IBGE fora do ar'); },
      coordenadasCnes: contar,
      geocodificar: contar,
    })),
    { message: 'IBGE fora do ar' },
  );
  assert.equal(chamadas, 0);
});

const mensagemTotal = (fontesComFalha) =>
  `Nenhuma farmácia ficou com coordenada e houve falha ao consultar ${fontesComFalha}. Nada foi gravado; tente de novo mais tarde.`;

test('CA12: sem nenhuma coordenada e só com falha do CNES a extração rejeita citando o CNES', async () => {
  await assert.rejects(
    extrair(await planilha([[1, 1], [1, 2]]), {}, fontes({ coordenadasCnes: async () => { throw falha(); } })),
    { message: mensagemTotal('o CNES') },
  );
});

test('CA12: sem nenhuma coordenada e só com falha do OpenStreetMap a extração rejeita citando o OpenStreetMap', async () => {
  await assert.rejects(
    extrair(await planilha([[1, 1], [1, 2]]), {}, fontes({ geocodificar: async () => { throw falha(); } })),
    { message: mensagemTotal('o OpenStreetMap') },
  );
});

test('CA12: sem nenhuma coordenada e com falha das duas fontes a extração rejeita citando as duas', async () => {
  const coordenadasCnes = async (codigo) => {
    if (codigo === codigoDe(1)) throw falha();
    return new Map();
  };
  await assert.rejects(
    extrair(await planilha([[1, 1], [2, 2]]), {}, fontes({ coordenadasCnes, geocodificar: async () => { throw falha(); } })),
    { message: mensagemTotal('o CNES e o OpenStreetMap') },
  );
});

test('CA13: sem falha e sem nenhuma coordenada a extração conclui com farmacias, municipios e estados vazios', async () => {
  const r = await extrair(await planilha([[1, 1], [2, 2]]), {}, fontes());
  assert.deepEqual(r.farmacias, []);
  assert.deepEqual(r.municipios, []);
  assert.deepEqual(r.estados, []);
  assert.equal(r.semCoordenada.length, 2);
});

test('CA14: metadados.falhas conta as farmácias afetadas em cada fonte e totalFarmacias soma com e sem coordenada', async () => {
  // Cidade 1 falha no CNES (farmácias 1 e 2); Cidade 2 tem a 3 no CNES e a 4 falha no OpenStreetMap
  const coordenadasCnes = async (codigo) => {
    if (codigo === codigoDe(1)) throw falha();
    return mapaCnes(3);
  };
  const r = await extrair(
    await planilha([[1, 1], [1, 2], [2, 3], [2, 4]]),
    {},
    fontes({ coordenadasCnes, geocodificar: async () => { throw falha(); } }),
  );
  assert.deepEqual(r.metadados.falhas, { cnes: 2, openStreetMap: 1 });
  assert.equal(r.farmacias.length, 1);
  assert.equal(r.semCoordenada.length, 3);
  assert.equal(r.metadados.totalFarmacias, r.farmacias.length + r.semCoordenada.length);
});

test('CA15: sem falha metadados.falhas zera as duas contagens', async () => {
  const r = await extrair(await planilha([[1, 1], [1, 2]]), {}, fontes({ coordenadasCnes: async () => mapaCnes(1) }));
  assert.deepEqual(r.metadados.falhas, { cnes: 0, openStreetMap: 0 });
});

test('CA16: CNPJ repetido em dois municípios, com falha do CNES no da primeira linha, aparece uma vez e em semCoordenada', async () => {
  // A farmácia 1 aparece na Cidade 1 (CNES falha) e na Cidade 2 (CNES tem coordenada); a 2 só dá coordenada para a extração não falhar por completo
  const coordenadasCnes = async (codigo) => {
    if (codigo === codigoDe(1)) throw falha();
    return mapaCnes(1, 2);
  };
  const r = await extrair(await planilha([[1, 1], [2, 1], [2, 2]]), {}, fontes({ coordenadasCnes }));
  assert.deepEqual(r.farmacias.map((f) => f.id), [cnpj(2)]);
  const itens = r.semCoordenada.filter((f) => f.cnpj === cnpj(1));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].motivo, MOTIVO_CNES);
});

// Execução de src/index.js com o fetch substituído, sem acesso à rede
const MODULO_FETCH = `
const cenario = process.env.CENARIO;
const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const estabelecimento = (numero) => ({
  numero_cnpj: numero,
  latitude_estabelecimento_decimo_grau: -7.2176,
  longitude_estabelecimento_decimo_grau: -35.8844,
});
const A = '11111111000111';
const B = '22222222000122';
const C = '33333333000133';
const cnesPorCenario = {
  parcial: { '250400': [A], '250750': 403 },
  cnesFalha: { '250400': 403, '250750': 403 },
  ok: { '250400': [A, B], '250750': [C] },
};
globalThis.fetch = async (url) => {
  const u = new URL(String(url));
  if (u.hostname === 'servicodados.ibge.gov.br') {
    if (u.pathname.endsWith('/estados')) return json([{ sigla: 'PB', nome: 'Paraíba' }]);
    if (u.pathname.endsWith('/estados/PB/municipios')) {
      return json([{ id: 2504009, nome: 'Campina Grande' }, { id: 2507507, nome: 'João Pessoa' }]);
    }
  }
  if (u.hostname === 'apidadosabertos.saude.gov.br') {
    const resposta = cnesPorCenario[cenario][u.searchParams.get('codigo_municipio')];
    if (typeof resposta === 'number') return json({}, resposta);
    return json({ estabelecimentos: resposta.map(estabelecimento) });
  }
  if (u.hostname === 'nominatim.openstreetmap.org') return json({}, 403);
  return json({}, 404);
};
`;

async function planilhaDoComando(caminho) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '22.222.222/0001-22', 'Farmácia B', 'Rua B, 2', 'Prata']);
  aba.addRow(['PB', 'JOAO PESSOA', '33.333.333/0001-33', 'Farmácia C', 'Rua C, 3', 'Tambaú']);
  await writeFile(caminho, Buffer.from(await livro.xlsx.writeBuffer()));
}

// Roda o comando em processo filho e remove as pastas temporárias ao fim
async function comComando(cenario, verificar, prepararSaida) {
  const entrada = await mkdtemp(join(tmpdir(), 'extrator-entrada-'));
  const saida = await mkdtemp(join(tmpdir(), 'extrator-saida-'));
  try {
    await writeFile(join(entrada, 'fetch.mjs'), MODULO_FETCH);
    await planilhaDoComando(join(entrada, 'farmacias.xlsx'));
    if (prepararSaida) await prepararSaida(saida);
    const processo = spawnSync(
      process.execPath,
      ['--import', pathToFileURL(join(entrada, 'fetch.mjs')).href, 'src/index.js', '--arquivo', join(entrada, 'farmacias.xlsx'), '--uf', 'PB', '--saida', saida],
      { cwd: PASTA_EXTRATOR, encoding: 'utf8', env: { ...process.env, CENARIO: cenario } },
    );
    await verificar(processo, saida);
  } finally {
    await rm(entrada, { recursive: true, force: true });
    await rm(saida, { recursive: true, force: true });
  }
}

const ARQUIVOS_SAIDA = ['estados.json', 'farmacias.json', 'geocodificadas.csv', 'metadados.json', 'municipios.json', 'sem-coordenadas.csv', 'sincronizacao.json'];

test('CA17: extração parcial termina com código 0, grava os 7 arquivos e imprime o aviso com as quantidades', async () => {
  await comComando('parcial', async (processo, saida) => {
    assert.equal(processo.status, 0, processo.stderr);
    assert.deepEqual((await readdir(saida)).sort(), ARQUIVOS_SAIDA);
    assert.match(
      processo.stdout,
      /Aviso: extração parcial por falha nas fontes\. Farmácias sem consulta ao CNES: 1; sem consulta ao OpenStreetMap: 1\. Elas estão em sem-coordenadas\.csv; rode a extração de novo para completá-las\./,
    );
    const metadados = JSON.parse(await readFile(join(saida, 'metadados.json'), 'utf8'));
    assert.deepEqual(metadados.falhas, { cnes: 1, openStreetMap: 1 });
    const farmacias = JSON.parse(await readFile(join(saida, 'farmacias.json'), 'utf8'));
    assert.deepEqual(farmacias.map((f) => f.id), ['11111111000111']);
    const semCoordenadas = await readFile(join(saida, 'sem-coordenadas.csv'), 'utf8');
    assert.match(semCoordenadas, /22222222000122.*CNPJ não encontrado no CNES; falha ao consultar o OpenStreetMap/);
    assert.match(semCoordenadas, /33333333000133.*falha ao consultar o CNES/);
  });
});

test('CA18: falha total termina com código 1, imprime o erro em stderr e não altera a pasta de saída', async () => {
  const anterior = { 'farmacias.json': '[{"id":"anterior"}]\n', 'observacao.txt': 'não mexer' };
  await comComando(
    'cnesFalha',
    async (processo, saida) => {
      assert.equal(processo.status, 1);
      assert.match(
        processo.stderr,
        /Erro: Nenhuma farmácia ficou com coordenada e houve falha ao consultar o CNES\. Nada foi gravado; tente de novo mais tarde\./,
      );
      assert.deepEqual((await readdir(saida)).sort(), Object.keys(anterior).sort());
      for (const [arquivo, conteudo] of Object.entries(anterior)) {
        assert.equal(await readFile(join(saida, arquivo), 'utf8'), conteudo, arquivo);
      }
    },
    async (saida) => {
      await mkdir(saida, { recursive: true });
      for (const [arquivo, conteudo] of Object.entries(anterior)) await writeFile(join(saida, arquivo), conteudo);
    },
  );
});

test('CA19: extração sem falha termina com código 0 e não imprime o aviso de extração parcial', async () => {
  await comComando('ok', async (processo, saida) => {
    assert.equal(processo.status, 0, processo.stderr);
    assert.doesNotMatch(processo.stdout, /extração parcial/);
    const metadados = JSON.parse(await readFile(join(saida, 'metadados.json'), 'utf8'));
    assert.equal(metadados.comCoordenada, 3);
  });
});
