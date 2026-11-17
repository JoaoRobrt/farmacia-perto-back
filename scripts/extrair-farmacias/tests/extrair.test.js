import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { extrair } from '../src/extrair.js';
import { lerFarmaciasPfpb } from '../src/fontes/pfpb.js';
import { coordenadaValida } from '../src/cruzamento.js';
import { resultadoAceito } from '../src/fontes/nominatim.js';

// Planilha no formato esperado: linhas de título antes do cabeçalho, acentos e CNPJ formatado
async function planilhaFicticia(cabecalho = ['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'ENDEREÇO', 'BAIRRO']) {
  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Farmácias');
  aba.addRow(['Lista de Farmácias Participantes do PFPB']);
  aba.addRow(['Atualizada em 02/10/2026']);
  aba.addRow(cabecalho);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '22.222.222/0001-22', 'Farmácia B', 'Rua B, 2', 'Prata']);
  aba.addRow(['PB', 'CAMPINA GRANDE', '11.111.111/0001-11', 'Farmácia A duplicada', 'Rua A, 1', 'Centro']);
  aba.addRow(['PB', 'JOAO PESSOA', '33.333.333/0001-33', 'Farmácia C', 'Rua C, 3', 'Tambaú']);
  aba.addRow(['PB', 'JOAO PESSOA', '44.444.444/0001-44', 'Farmácia D', 'Rua D, 4', 'Manaíra']);
  aba.addRow(['SP', 'SAO PAULO', '55.555.555/0001-55', 'Farmácia E', 'Rua E, 5', 'Sé']);
  return Buffer.from(await livro.xlsx.writeBuffer());
}

const cnesFicticio = {
  2504009: new Map([
    ['11111111000111', { latitude: -7.2176, longitude: -35.8844 }],
    ['22222222000122', { latitude: 0, longitude: 0 }], // coordenada zerada no CNES
  ]),
  2507507: new Map([['33333333000133', { latitude: -7.115, longitude: -34.86 }]]),
};

const fontesFicticias = () => {
  const consultados = [];
  return {
    consultados,
    listarEstados: async () => [{ sigla: 'PB', nome: 'Paraíba' }, { sigla: 'SP', nome: 'São Paulo' }],
    listarMunicipios: async (uf) =>
      uf === 'PB'
        ? [{ codigo: '2504009', nome: 'Campina Grande' }, { codigo: '2507507', nome: 'João Pessoa' }]
        : [{ codigo: '3550308', nome: 'São Paulo' }],
    coordenadasCnes: async (codigo) => {
      consultados.push(codigo);
      return cnesFicticio[codigo] ?? new Map();
    },
    geocodificar: async () => undefined,
    log: () => {},
  };
};

test('acha o cabeçalho depois das linhas de título e normaliza o CNPJ', async () => {
  const linhas = await lerFarmaciasPfpb(await planilhaFicticia());
  assert.equal(linhas.length, 6);
  assert.deepEqual(linhas[0], {
    cnpj: '11111111000111', uf: 'PB', municipio: 'CAMPINA GRANDE', codigoMunicipio: '',
    nome: 'Farmácia A', endereco: 'Rua A, 1', bairro: 'Centro',
  });
});

test('falha com mensagem clara quando falta coluna obrigatória', async () => {
  const planilha = await planilhaFicticia(['UF', 'MUNICÍPIO', 'CNPJ', 'FARMÁCIA', 'RUA', 'BAIRRO']);
  await assert.rejects(lerFarmaciasPfpb(planilha), /Colunas obrigatórias não encontradas: endereco/);
});

test('gera farmácias no formato do contrato só com coordenadas válidas do CNES', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontesFicticias());

  assert.deepEqual(r.farmacias, [
    { id: '11111111000111', nome: 'Farmácia A', endereco: 'Rua A, 1', bairro: 'Centro', municipioId: 'pb-campina-grande', latitude: -7.2176, longitude: -35.8844 },
    { id: '33333333000133', nome: 'Farmácia C', endereco: 'Rua C, 3', bairro: 'Tambaú', municipioId: 'pb-joao-pessoa', latitude: -7.115, longitude: -34.86 },
  ]);
  assert.deepEqual(
    r.semCoordenada.map((f) => [f.cnpj, f.motivo]),
    [
      ['22222222000122', 'coordenada inválida no CNES; endereço não localizado no OpenStreetMap'],
      ['44444444000144', 'CNPJ não encontrado no CNES; endereço não localizado no OpenStreetMap'],
    ],
  );
});

test('geocodifica pelo endereço quem ficou sem coordenada no CNES', async () => {
  const fontes = fontesFicticias();
  const pedidos = [];
  fontes.geocodificar = async (f) => {
    pedidos.push(f.cnpj);
    return f.cnpj === '44444444000144' ? { latitude: -7.09, longitude: -34.84, precisao: 'house' } : undefined;
  };
  const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontes);

  assert.deepEqual(pedidos, ['22222222000122', '44444444000144']);
  assert.deepEqual(r.farmacias.at(-1), {
    id: '44444444000144', nome: 'Farmácia D', endereco: 'Rua D, 4', bairro: 'Manaíra', municipioId: 'pb-joao-pessoa', latitude: -7.09, longitude: -34.84,
  });
  assert.deepEqual(r.geocodificadas.map((g) => [g.cnpj, g.precisao]), [['44444444000144', 'house']]);
  assert.deepEqual(r.semCoordenada.map((f) => f.cnpj), ['22222222000122']);
  assert.equal(r.metadados.viaCnes, 2);
  assert.equal(r.metadados.viaGeocodificacao, 1);
  assert.equal(r.metadados.cobertura, 75);
});

test('com geocodificar: false não chama o geocodificador', async () => {
  const fontes = fontesFicticias();
  let chamadas = 0;
  fontes.geocodificar = async () => { chamadas++; return { latitude: -7.1, longitude: -34.8, precisao: 'house' }; };
  const r = await extrair(await planilhaFicticia(), { uf: 'PB', geocodificar: false }, fontes);
  assert.equal(chamadas, 0);
  assert.equal(r.farmacias.length, 2);
  assert.deepEqual(r.semCoordenada.map((f) => f.motivo), ['coordenada inválida no CNES', 'CNPJ não encontrado no CNES']);
});

test('Nominatim: aceita só resultado de rua ou mais preciso no município certo', () => {
  const casa = { addresstype: 'house', address: { city: 'Campina Grande' } };
  assert.equal(resultadoAceito(casa, 'Campina Grande'), true);
  assert.equal(resultadoAceito({ addresstype: 'road', address: { town: 'Campina Grande' } }, 'CAMPINA GRANDE'), true);
  assert.equal(resultadoAceito({ addresstype: 'city', address: { city: 'Campina Grande' } }, 'Campina Grande'), false);
  assert.equal(resultadoAceito({ addresstype: 'suburb', address: { city: 'Campina Grande' } }, 'Campina Grande'), false);
  assert.equal(resultadoAceito({ addresstype: 'house', address: { city: 'Queimadas' } }, 'Campina Grande'), false);
  assert.equal(resultadoAceito(undefined, 'Campina Grande'), false);
});

test('usa o nome oficial do IBGE nos municípios e só lista UFs com farmácia', async () => {
  const r = await extrair(await planilhaFicticia(), { uf: 'PB' }, fontesFicticias());
  assert.deepEqual(r.municipios, [
    { id: 'pb-campina-grande', nome: 'Campina Grande', uf: 'PB' },
    { id: 'pb-joao-pessoa', nome: 'João Pessoa', uf: 'PB' },
  ]);
  assert.deepEqual(r.estados, [{ sigla: 'PB', nome: 'Paraíba' }]);
  assert.equal(r.metadados.totalFarmacias, 4);
  assert.equal(r.metadados.cobertura, 50);
});

test('com filtro de município consulta o CNES só daquele município', async () => {
  const fontes = fontesFicticias();
  const r = await extrair(await planilhaFicticia(), { uf: 'PB', municipio: 'Campina Grande' }, fontes);
  assert.deepEqual(fontes.consultados, ['2504009']);
  assert.ok(r.farmacias.every((f) => f.municipioId === 'pb-campina-grande'));
});

test('filtro sem resultado gera erro em vez de saída vazia', async () => {
  await assert.rejects(
    extrair(await planilhaFicticia(), { uf: 'AC' }, fontesFicticias()),
    /Nenhuma farmácia após o filtro/,
  );
});

test('rejeita coordenadas zeradas ou fora do Brasil', () => {
  assert.equal(coordenadaValida(-7.2, -35.8), true);
  assert.equal(coordenadaValida(0, 0), false);
  assert.equal(coordenadaValida(40.7, -74.0), false);
  assert.equal(coordenadaValida(NaN, -35.8), false);
});
