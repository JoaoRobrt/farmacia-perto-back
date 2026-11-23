import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { extrair } from '../src/extrair.js';
import { gravarSaida } from '../src/saida.js';

// Mesmas linhas de extrair.test.js, mais uma de município ausente do IBGE fictício e uma com a UF fora do padrão
async function planilhaFicticia() {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['Lista de Farmácias Participantes do PFPB']);
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '22.222.222/0001-22', 'Farmácia B', 'Rua B, 2', 'Prata']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A duplicada', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'JOAO PESSOA', '33.333.333/0001-33', 'Farmácia C', 'Rua C, 3', 'Tambaú']);
  aba.addRow(['PB', 'JOAO PESSOA', '44.444.444/0001-44', 'Farmácia D', 'Rua D, 4', 'Manaíra']);
  aba.addRow(['PB', 'CIDADE QUE NAO EXISTE', '66.666.666/0001-66', 'Farmácia F', 'Rua F, 6', 'Centro']);
  aba.addRow(['SP', 'SAO PAULO', '55.555.555/0001-55', 'Farmácia E', 'Rua E, 5', 'Sé']);
  aba.addRow(['PARAIBA', 'CAMPINA GRANDE', '77.777.777/0001-77', 'Farmácia G', 'Rua G, 7', 'Centro']);
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const fontesFicticias = () => ({
  listarEstados: async () => [{ sigla: 'PB', nome: 'Paraíba' }, { sigla: 'SP', nome: 'São Paulo' }],
  listarMunicipios: async (uf) =>
    uf === 'PB'
      ? [{ codigo: '2504009', nome: 'Campina Grande' }, { codigo: '2507507', nome: 'João Pessoa' }]
      : [{ codigo: '3550308', nome: 'São Paulo' }],
  coordenadasCnes: async (codigo) =>
    codigo === '2504009' ? new Map([['11111111000111', { latitude: -7.2176, longitude: -35.8844 }]]) : new Map(),
  geocodificar: async () => undefined,
  log: () => {},
});

const TODAS = ['11111111000111', '22222222000122', '33333333000133', '44444444000144', '55555555000155', '66666666000166', '77777777000177'];
const ordenar = (lista) => [...lista].sort();

test('CA2: com geocodificar: false a lista de credenciadas inclui as sem coordenada, sem repetir CNPJ', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB', geocodificar: false }, fontesFicticias());
  assert.deepEqual(r.farmacias.map((f) => f.id), ['11111111000111']);
  assert.deepEqual(ordenar(r.sincronizacao.credenciadas), TODAS);
});

test('CA3: CNPJ de município não reconhecido no IBGE está na lista de credenciadas', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontesFicticias());
  assert.ok(r.semCoordenada.some((f) => f.cnpj === '66666666000166' && f.motivo === 'município não reconhecido no IBGE'));
  assert.ok(r.sincronizacao.credenciadas.includes('66666666000166'));
});

test('CA4: filtro por município mantém na lista as farmácias dos outros municípios da UF', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB', municipio: 'Campina Grande' }, fontesFicticias());
  assert.deepEqual(r.farmacias.map((f) => f.id), ['11111111000111']);
  assert.deepEqual(r.sincronizacao.ufs, ['PB']);
  assert.deepEqual(ordenar(r.sincronizacao.credenciadas), TODAS);
});

test('CA13: filtro de UF mantém na lista as farmácias de outra UF e as com UF fora do padrão', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontesFicticias());
  assert.deepEqual(r.sincronizacao.ufs, ['PB']);
  assert.ok(r.sincronizacao.credenciadas.includes('55555555000155'));
  assert.ok(r.sincronizacao.credenciadas.includes('77777777000177'));
});

test('CA8: sem filtro de UF as UFs cobertas são as de duas letras da planilha', async () => {
  const r = await extrair(await planilhaFicticia(), {}, fontesFicticias());
  assert.deepEqual(r.sincronizacao.ufs, ['PB', 'SP']);
  assert.deepEqual(ordenar(r.sincronizacao.credenciadas), TODAS);
});

test('CA8: com filtro de UF as UFs cobertas são só a filtrada', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'SP' }, fontesFicticias());
  assert.deepEqual(r.sincronizacao.ufs, ['SP']);
});

test('T1: gravarSaida grava sincronizacao.json com ufs e credenciadas', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'extrator-'));
  try {
    const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontesFicticias());
    await gravarSaida(pasta, r);
    const gravado = JSON.parse(await readFile(join(pasta, 'sincronizacao.json'), 'utf8'));
    assert.deepEqual(gravado, { ufs: ['PB'], credenciadas: r.sincronizacao.credenciadas });
    assert.deepEqual(ordenar(gravado.credenciadas), TODAS);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
});

// Planilha com farmácias da PB e de SP e as linhas extras informadas, cada uma [UF, município, CNPJ]
async function planilhaComUfs(extras) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['Lista de Farmácias Participantes do PFPB']);
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'JOAO PESSOA', '33.333.333/0001-33', 'Farmácia C', 'Rua C, 3', 'Tambaú']);
  aba.addRow(['SP', 'SAO PAULO', '55.555.555/0001-55', 'Farmácia E', 'Rua E, 5', 'Sé']);
  for (const [uf, municipio, cnpj] of extras) {
    aba.addRow([uf, municipio, cnpj, `Farmácia ${cnpj.slice(0, 2)}`, 'Rua X, 9', 'Centro']);
  }
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const UF_VAZIA = ['', 'CAMPINA GRANDE', '81.111.111/0001-11'];
const UFS_RUINS = [
  ['PARAIBA', 'CAMPINA GRANDE', '82.222.222/0001-22'],
  ['RIO GRANDE DO NORTE', 'NATAL', '83.333.333/0001-33'],
  ['25', 'CAMPINA GRANDE', '84.444.444/0001-44'],
];
const CNPJS_RUINS = ['81111111000111', '82222222000122', '83333333000133', '84444444000144'];
const COORDENADA = { latitude: -7.2176, longitude: -35.8844 };

// Falha para qualquer UF fora do padrão, como o IBGE real (404 ou 500)
function fonteQueFalhaParaUfForaDoPadrao() {
  const consultadas = [];
  return {
    consultadas,
    listarEstados: async () => [{ sigla: 'PB', nome: 'Paraíba' }, { sigla: 'SP', nome: 'São Paulo' }],
    listarMunicipios: async (uf) => {
      consultadas.push(uf);
      if (!/^[A-Z]{2}$/.test(uf)) throw new Error(`IBGE: UF "${uf}" inválida`);
      return uf === 'PB'
        ? [{ codigo: '2504009', nome: 'Campina Grande' }, { codigo: '2507507', nome: 'João Pessoa' }]
        : [{ codigo: '3550308', nome: 'São Paulo' }];
    },
    coordenadasCnes: async (codigo) =>
      codigo === '2504009'
        ? new Map([['11111111000111', COORDENADA]])
        : new Map(),
    geocodificar: async () => undefined,
    log: () => {},
  };
}

test('uma UF vazia fica fora de ufs e a extração conclui sem filtro', async () => {
  const r = await extrair(await planilhaComUfs([UF_VAZIA]), {}, fonteQueFalhaParaUfForaDoPadrao());
  assert.deepEqual(r.sincronizacao.ufs, ['PB', 'SP']);
});

test('UFs por extenso, com barra ou numéricas ficam fora de ufs', async () => {
  const r = await extrair(await planilhaComUfs(UFS_RUINS), {}, fonteQueFalhaParaUfForaDoPadrao());
  assert.deepEqual(r.sincronizacao.ufs, ['PB', 'SP']);
});

test('a extração conclui, consulta o IBGE só para PB e SP e mantém as farmácias da PB com coordenada', async () => {
  const fonte = fonteQueFalhaParaUfForaDoPadrao();
  const r = await extrair(await planilhaComUfs([UF_VAZIA, ...UFS_RUINS]), {}, fonte);
  assert.deepEqual(ordenar(fonte.consultadas), ['PB', 'SP']);
  assert.deepEqual(r.farmacias.map((f) => f.id), ['11111111000111']);
  assert.deepEqual(r.farmacias[0].latitude, COORDENADA.latitude);
  assert.ok(r.municipios.some((m) => m.id === 'pb-campina-grande' && m.uf === 'PB'));
});

test('uma linha com UF 25 e município que a fonte reconhece não gera município nem farmácia com a UF 25', async () => {
  const fonte = {
    ...fonteQueFalhaParaUfForaDoPadrao(),
    listarMunicipios: async () => [{ codigo: '2504009', nome: 'Campina Grande' }],
    coordenadasCnes: async () => new Map([['84444444000144', COORDENADA]]),
  };
  const r = await extrair(await planilhaComUfs([['25', 'CAMPINA GRANDE', '84.444.444/0001-44']]), {}, fonte);
  assert.ok(r.municipios.every((m) => m.uf !== '25' && !m.id.startsWith('25')));
  assert.ok(r.farmacias.every((f) => f.id !== '84444444000144' && !f.municipioId.startsWith('25')));
  assert.ok(r.estados.every((e) => e.sigla !== '25'));
  assert.ok(!r.sincronizacao.ufs.includes('25'));
});

test('regressão: os CNPJs de linhas com UF fora do padrão continuam em credenciadas', async () => {
  // Fonte que responde lista vazia, como o IBGE real faz para algumas UFs ruins, para a extração concluir
  const fonte = { ...fonteQueFalhaParaUfForaDoPadrao(), listarMunicipios: async () => [] };
  const r = await extrair(await planilhaComUfs([UF_VAZIA, ...UFS_RUINS]), {}, fonte);
  for (const cnpj of CNPJS_RUINS) assert.ok(r.sincronizacao.credenciadas.includes(cnpj), cnpj);
});

test('cada farmácia com UF fora do padrão aparece uma vez em semCoordenada e conta em totalFarmacias', async () => {
  const r = await extrair(await planilhaComUfs([UF_VAZIA, ...UFS_RUINS]), {}, fonteQueFalhaParaUfForaDoPadrao());
  for (const cnpj of CNPJS_RUINS) {
    const itens = r.semCoordenada.filter((f) => f.cnpj === cnpj);
    assert.equal(itens.length, 1, cnpj);
    assert.equal(itens[0].motivo, 'município não reconhecido no IBGE');
  }
  assert.equal(r.metadados.semCoordenada, r.semCoordenada.length);
  assert.equal(r.metadados.totalFarmacias, r.farmacias.length + r.semCoordenada.length);
  assert.equal(r.metadados.totalFarmacias, 3 + CNPJS_RUINS.length);
});

test('uma planilha só com UF fora do padrão conclui com ufs vazia', async () => {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  for (const [uf, municipio, cnpj] of [UF_VAZIA, ...UFS_RUINS]) aba.addRow([uf, municipio, cnpj, 'Farmácia', 'Rua X, 9', 'Centro']);
  const fonte = fonteQueFalhaParaUfForaDoPadrao();
  const r = await extrair(Buffer.from(await livro.xlsx.writeBuffer()), {}, fonte);
  assert.deepEqual(r.sincronizacao.ufs, []);
  assert.deepEqual(ordenar(r.sincronizacao.credenciadas), CNPJS_RUINS);
  assert.deepEqual(fonte.consultadas, []);
  assert.equal(r.metadados.totalFarmacias, CNPJS_RUINS.length);
});

test('regressão: a falha da fonte de municípios para uma UF no padrão faz a extração falhar', async () => {
  const fonte = {
    ...fonteQueFalhaParaUfForaDoPadrao(),
    listarMunicipios: async (uf) => {
      if (uf === 'SP') throw new Error('IBGE indisponível');
      return [{ codigo: '2504009', nome: 'Campina Grande' }];
    },
  };
  await assert.rejects(extrair(await planilhaComUfs([UF_VAZIA]), {}, fonte), /IBGE indisponível/);
});
