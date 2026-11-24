import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extrair } from '../src/extrair.js';
import { lerFarmaciasPfpb } from '../src/fontes/pfpb.js';
import { coordenadasCnesPorCnpj } from '../src/fontes/cnes.js';
import { normalizarCnpj } from '../src/texto.js';

// Cada valor vira uma linha da planilha; número fica como célula numérica
async function planilha(...cnpjs) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']);
  cnpjs.forEach((valor, i) => aba.addRow(['PB', 'CAMPINA GRANDE', valor, `Farmácia ${i}`, `Rua ${i}`, 'Centro']));
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const lerCnpjs = async (...valores) => (await lerFarmaciasPfpb(await planilha(...valores))).map((f) => f.cnpj);

// Simula a API do CNES com os estabelecimentos dados (menos de 20 itens encerra a paginação)
function simularCnes(t, ...cnpjs) {
  const estabelecimentos = cnpjs.map((numero_cnpj) => ({
    numero_cnpj,
    latitude_estabelecimento_decimo_grau: -7.2,
    longitude_estabelecimento_decimo_grau: -35.9,
  }));
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ estabelecimentos })));
}

const fontes = (sobrescritas = {}) => ({
  listarEstados: async () => [{ sigla: 'PB', nome: 'Paraíba' }],
  listarMunicipios: async () => [{ codigo: '2504009', nome: 'Campina Grande' }],
  geocodificar: async () => undefined,
  log: () => {},
  ...sobrescritas,
});

test('le CNPJ alfanumerico da planilha em maiusculas e sem pontuacao', async () => {
  for (const entrada of ['12.ABC.345/01DE-35', '12abc34501de35', ' 12.abc.345/01de-35 ']) {
    assert.deepEqual(await lerCnpjs(entrada), ['12ABC34501DE35'], entrada);
  }
});

test('mantem distintos dois CNPJs alfanumericos que so diferem nas letras', async () => {
  assert.deepEqual(await lerCnpjs('12.ABC.345/01DE-35', '12.XYZ.345/01FG-35'), ['12ABC34501DE35', '12XYZ34501FG35']);
});

test('preserva CNPJ so com letras na raiz e zeros a esquerda', async () => {
  assert.deepEqual(await lerCnpjs('AB.CDE.FGH/IJKL-35'), ['ABCDEFGHIJKL35']);
  assert.deepEqual(await lerCnpjs('00.ABC.345/01DE-35'), ['00ABC34501DE35']);
});

test('indexa o CNES pelo CNPJ alfanumerico com ou sem pontuacao e em qualquer caixa', async (t) => {
  for (const entrada of ['12ABC34501DE35', '12.abc.345/01de-35']) {
    simularCnes(t, entrada);
    const mapa = await coordenadasCnesPorCnpj('2504009');
    assert.deepEqual([...mapa.keys()], ['12ABC34501DE35'], entrada);
    assert.equal(mapa.get('12ABC34501DE35').latitude, -7.2);
    t.mock.restoreAll();
  }
});

test('cruza planilha e CNES pelo CNPJ alfanumerico e o inclui em credenciadas', async (t) => {
  simularCnes(t, '12abc34501de35');
  const r = await extrair(await planilha('12.ABC.345/01DE-35'), { uf: 'PB' }, fontes());
  assert.deepEqual(r.farmacias.map((f) => [f.id, f.latitude, f.longitude]), [['12ABC34501DE35', -7.2, -35.9]]);
  assert.equal(r.metadados.viaCnes, 1);
  assert.deepEqual(r.sincronizacao.credenciadas, ['12ABC34501DE35']);
});

test('trata como repetido o mesmo CNPJ alfanumerico escrito de formas diferentes', async (t) => {
  simularCnes(t, '12ABC34501DE35');
  const r = await extrair(await planilha('12.ABC.345/01DE-35', '12abc34501de35'), { uf: 'PB' }, fontes());
  assert.deepEqual(r.farmacias.map((f) => f.id), ['12ABC34501DE35']);
  assert.deepEqual(r.sincronizacao.credenciadas, ['12ABC34501DE35']);
});

test('CNPJ numerico: remove pontuacao, recompoe zeros da celula numerica e ignora linha sem algarismo', async () => {
  assert.deepEqual(await lerCnpjs('11.111.111/0001-11'), ['11111111000111']);
  assert.deepEqual(await lerCnpjs(1111111000111), ['01111111000111']);
  assert.deepEqual(await lerCnpjs('CNPJ: 11.111.111/0001-11 (MATRIZ)'), ['11111111000111']);
  assert.deepEqual(await lerCnpjs('Total', ''), []);
});

test('CNES: ignora numero_cnpj nulo, vazio ou com 13 algarismos e indexa o de 14', async (t) => {
  simularCnes(t, null, '', '1111111000111', '11111111000111');
  const mapa = await coordenadasCnesPorCnpj('2504009');
  assert.deepEqual([...mapa.keys()], ['11111111000111']);
});

test('valor com letras fora do formato mantem a regra de so algarismos', () => {
  assert.equal(normalizarCnpj('12ABC34501DEF5'), '12345015');
  assert.equal(normalizarCnpj('12ABC34501DE3'), '12345013');
});
