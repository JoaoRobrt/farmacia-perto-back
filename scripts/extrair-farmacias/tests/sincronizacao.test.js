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

test('CA8: sem filtro de UF as UFs cobertas são as da planilha', async () => {
  const r = await extrair(await planilhaFicticia(), {}, fontesFicticias());
  assert.deepEqual(r.sincronizacao.ufs, ['PARAIBA', 'PB', 'SP']);
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
