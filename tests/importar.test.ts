import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { importarDados } from '../src/db/importar';
import { criarPool } from '../src/db/pool';
import { aplicarSchema } from '../src/db/schema';
import { criarFarmaciasRepositoryPg } from '../src/modules/farmacias/farmacias.repository.pg';
import { carregarArquivoEnv } from '../src/shared/config';

const estados = [
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'SP', nome: 'São Paulo' },
];
const municipios = [
  { id: '2504009', nome: 'Campina Grande', uf: 'PB' },
  { id: '3550308', nome: 'São Paulo', uf: 'SP' },
];
const farmacia = (id: string, nome: string, municipioId: string, latitude = -7.2, longitude = -35.9) => ({
  id,
  nome,
  endereco: `Rua ${id}, 1`,
  bairro: 'Centro',
  municipioId,
  latitude,
  longitude,
});
const farmacias = [
  farmacia('f1', 'Alfa Farma', '2504009', -7.2418, -35.8911),
  farmacia('f2', 'Beta Farma', '2504009', -7.2147, -35.9087),
  farmacia('f3', 'Gama Farma', '3550308', -23.5613, -46.6565),
];
const sincronizacao = { ufs: ['PB', 'SP'], credenciadas: ['f1', 'f2', 'f3'] };
const dadosBase = { estados, municipios, farmacias, sincronizacao };

describe('importarDados: validação', () => {
  const connect = vi.fn();
  const pool = { connect } as unknown as Pool;

  beforeEach(() => connect.mockReset());

  const casos: [string, Partial<Record<'estados' | 'municipios' | 'farmacias' | 'sincronizacao', unknown>>, string][] = [
    ['entrada que não é array', { estados: { sigla: 'PB' } }, 'estados.json: o conteúdo deve ser uma lista (array).'],
    ['item que não é objeto', { municipios: [municipios[0], 'texto'] }, 'municipios.json, item 1: deve ser um objeto.'],
    [
      'campo ausente',
      { farmacias: [farmacias[0], { ...farmacias[1], bairro: undefined }] },
      'farmacias.json, item 1: campo "bairro" ausente.',
    ],
    [
      'campo null',
      { estados: [{ sigla: 'PB', nome: null }] },
      'estados.json, item 0: campo "nome" ausente.',
    ],
    [
      'campo de texto que não é string',
      { municipios: [{ ...municipios[0], nome: 123 }] },
      'municipios.json, item 0: campo "nome" deve ser texto.',
    ],
    [
      'id só com espaços',
      { estados: [{ sigla: '   ', nome: 'Paraíba' }] },
      'estados.json, item 0: campo "sigla" não pode ser vazio.',
    ],
    [
      'latitude que não é número finito',
      { farmacias: [{ ...farmacias[0], latitude: Infinity }] },
      'farmacias.json, item 0: campo "latitude" deve ser um número finito.',
    ],
    [
      'longitude em string',
      { farmacias: [{ ...farmacias[0], longitude: '-35.9' }] },
      'farmacias.json, item 0: campo "longitude" deve ser um número finito.',
    ],
    [
      'municipioId inexistente',
      { farmacias: [farmacias[0], farmacia('f9', 'Órfã', '9999999')] },
      'farmacias.json, item 1: municipioId "9999999" não existe em municipios.json.',
    ],
    [
      'farmácia ausente da lista de credenciadas',
      { farmacias: [farmacias[0], farmacia('f9', 'Fora da lista', '2504009')] },
      'farmacias.json, item 1: id "f9" não está em "credenciadas" de sincronizacao.json.',
    ],
    ['sincronizacao que é lista', { sincronizacao: [] }, 'sincronizacao.json: o conteúdo deve ser um objeto.'],
    ['sincronizacao null', { sincronizacao: null }, 'sincronizacao.json: o conteúdo deve ser um objeto.'],
    ['sincronizacao texto', { sincronizacao: 'PB' }, 'sincronizacao.json: o conteúdo deve ser um objeto.'],
    [
      'ufs ausente',
      { sincronizacao: { credenciadas: ['f1'] } },
      'sincronizacao.json: campo "ufs" ausente.',
    ],
    [
      'credenciadas ausente',
      { sincronizacao: { ufs: ['PB'] } },
      'sincronizacao.json: campo "credenciadas" ausente.',
    ],
    [
      'ufs que não é lista',
      { sincronizacao: { ufs: 'PB', credenciadas: ['f1'] } },
      'sincronizacao.json: campo "ufs" deve ser uma lista (array).',
    ],
    [
      'credenciadas que não é lista',
      { sincronizacao: { ufs: ['PB'], credenciadas: 'f1' } },
      'sincronizacao.json: campo "credenciadas" deve ser uma lista (array).',
    ],
    [
      'ufs vazia',
      { sincronizacao: { ufs: [], credenciadas: ['f1'] } },
      'sincronizacao.json: campo "ufs" não pode ser vazio.',
    ],
    [
      'credenciadas vazia',
      { sincronizacao: { ufs: ['PB'], credenciadas: [] } },
      'sincronizacao.json: campo "credenciadas" não pode ser vazio.',
    ],
    [
      'item de ufs que não é texto',
      { sincronizacao: { ufs: ['PB', 25], credenciadas: ['f1'] } },
      'sincronizacao.json: campo "ufs", item 1: deve ser texto.',
    ],
    [
      'item de credenciadas que não é texto',
      { sincronizacao: { ufs: ['PB'], credenciadas: ['f1', null] } },
      'sincronizacao.json: campo "credenciadas", item 1: deve ser texto.',
    ],
    [
      'item de ufs vazio',
      { sincronizacao: { ufs: ['  '], credenciadas: ['f1'] } },
      'sincronizacao.json: campo "ufs", item 0: não pode ser vazio.',
    ],
    [
      'item de credenciadas vazio',
      { sincronizacao: { ufs: ['PB'], credenciadas: ['f1', ''] } },
      'sincronizacao.json: campo "credenciadas", item 1: não pode ser vazio.',
    ],
  ];

  it.each(casos)('rejeita %s sem tocar no banco', async (_nome, alteracao, mensagem) => {
    await expect(importarDados(pool, { ...dadosBase, ...alteracao })).rejects.toThrow(new Error(mensagem));
    expect(connect).not.toHaveBeenCalled();
  });

  it('rejeita dados sem a propriedade sincronizacao sem tocar no banco', async () => {
    await expect(
      importarDados(pool, { estados, municipios, farmacias } as unknown as Parameters<typeof importarDados>[1]),
    ).rejects.toThrow(new Error('sincronizacao.json: o conteúdo deve ser um objeto.'));
    expect(connect).not.toHaveBeenCalled();
  });
});

describe('importar.cli: pasta sem sincronizacao.json', () => {
  let pasta: string;

  beforeAll(() => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'importar-cli-'));
    fs.writeFileSync(path.join(pasta, 'estados.json'), JSON.stringify(estados));
    fs.writeFileSync(path.join(pasta, 'municipios.json'), JSON.stringify(municipios));
    fs.writeFileSync(path.join(pasta, 'farmacias.json'), JSON.stringify(farmacias));
  });

  afterAll(() => fs.rmSync(pasta, { recursive: true, force: true }));

  it('termina com código 1 citando sincronizacao.json', () => {
    const cli = path.resolve(__dirname, '../src/db/importar.cli.ts');
    const resultado = spawnSync(process.execPath, ['--import', 'tsx', cli, pasta], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, DATABASE_URL: 'postgres://127.0.0.1:1/inexistente' },
    });

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('sincronizacao.json');
    expect(resultado.stdout).not.toContain('Importação concluída');
  }, 60_000);
});

carregarArquivoEnv();
const url = process.env.DATABASE_URL_TEST ?? '';

describe.skipIf(!url)('importarDados: Postgres', () => {
  let pool: Pool;

  const limpar = () => pool.query('TRUNCATE farmacias, municipios, estados');
  const idsFarmacias = async () =>
    (await pool.query<{ id: string }>('SELECT id FROM farmacias ORDER BY id')).rows.map((r) => r.id);

  beforeAll(async () => {
    if (url.trim() === process.env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL_TEST não pode ser igual a DATABASE_URL: os testes apagam os dados.');
    }
    pool = criarPool(url);
    await aplicarSchema(pool);
  });

  beforeEach(async () => {
    await limpar();
  });

  afterAll(async () => {
    if (!pool) return;
    await limpar();
    await pool.end();
  });

  it('grava estados, municípios e farmácias e devolve o resumo', async () => {
    const resumo = await importarDados(pool, dadosBase);

    expect(resumo).toEqual({ estados: 2, municipios: 2, farmacias: 3, farmaciasRemovidas: 0 });
    expect((await pool.query('SELECT sigla, nome FROM estados ORDER BY sigla')).rows).toEqual(estados);
    expect((await pool.query('SELECT id, nome, uf FROM municipios ORDER BY id')).rows).toEqual(municipios);
    expect(await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('2504009')).toEqual([
      farmacias[0],
      farmacias[1],
    ]);
    expect(await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('3550308')).toEqual([farmacias[2]]);
  });

  it('importar os mesmos dados de novo não duplica e não remove nada', async () => {
    await importarDados(pool, dadosBase);
    const resumo = await importarDados(pool, dadosBase);

    expect(resumo).toEqual({ estados: 2, municipios: 2, farmacias: 3, farmaciasRemovidas: 0 });
    expect((await pool.query('SELECT count(*)::int AS n FROM estados')).rows[0].n).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS n FROM municipios')).rows[0].n).toBe(2);
    expect(await idsFarmacias()).toEqual(['f1', 'f2', 'f3']);
  });

  it('atualiza nome e coordenadas de uma farmácia existente', async () => {
    await importarDados(pool, dadosBase);
    const alterada = { ...farmacias[0], nome: 'Alfa Nova', latitude: -7.5, longitude: -35.5 };

    const resumo = await importarDados(pool, {
      estados,
      municipios,
      farmacias: [alterada, farmacias[1], farmacias[2]],
      sincronizacao,
    });

    expect(resumo.farmaciasRemovidas).toBe(0);
    const lista = await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('2504009');
    expect(lista).toEqual([alterada, farmacias[1]]);
  });

  it('mantém no banco, com os mesmos dados, a farmácia credenciada que ficou fora de farmacias.json (CA1)', async () => {
    await importarDados(pool, dadosBase);

    const resumo = await importarDados(pool, {
      estados,
      municipios,
      farmacias: [farmacias[0], farmacias[2]],
      sincronizacao,
    });

    expect(resumo).toEqual({ estados: 2, municipios: 2, farmacias: 2, farmaciasRemovidas: 0 });
    expect(await idsFarmacias()).toEqual(['f1', 'f2', 'f3']);
    expect(await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('2504009')).toEqual([
      farmacias[0],
      farmacias[1],
    ]);
  });

  it('remove a única farmácia de um município fora de municipios.json que saiu da planilha (CA5)', async () => {
    await importarDados(pool, dadosBase);

    const resumo = await importarDados(pool, {
      estados,
      municipios: [municipios[0]],
      farmacias: [farmacias[0], farmacias[1]],
      sincronizacao: { ufs: ['PB', 'SP'], credenciadas: ['f1', 'f2'] },
    });

    expect(resumo.farmaciasRemovidas).toBe(1);
    expect(await idsFarmacias()).toEqual(['f1', 'f2']);
    expect((await pool.query('SELECT id FROM municipios ORDER BY id')).rows.map((r) => r.id)).toEqual([
      '2504009',
      '3550308',
    ]);
  });

  it('remove e conta a farmácia fora de farmacias.json e das credenciadas em município importado (CA6)', async () => {
    await importarDados(pool, dadosBase);

    const resumo = await importarDados(pool, {
      estados,
      municipios,
      farmacias: [farmacias[0], farmacias[2]],
      sincronizacao: { ufs: ['PB', 'SP'], credenciadas: ['f1', 'f3'] },
    });

    expect(resumo).toEqual({ estados: 2, municipios: 2, farmacias: 2, farmaciasRemovidas: 1 });
    expect(await idsFarmacias()).toEqual(['f1', 'f3']);
  });

  it('não remove farmácias de UFs fora de sincronizacao.ufs (CA7)', async () => {
    await importarDados(pool, dadosBase);

    const resumo = await importarDados(pool, {
      estados,
      municipios: [municipios[0]],
      farmacias: [farmacias[0]],
      sincronizacao: { ufs: ['PB'], credenciadas: ['f1'] },
    });

    expect(resumo.farmaciasRemovidas).toBe(1);
    expect(await idsFarmacias()).toEqual(['f1', 'f3']);
  });

  it('desfaz tudo quando o banco rejeita um item no meio da transação (CA12)', async () => {
    await importarDados(pool, dadosBase);

    await expect(
      importarDados(pool, {
        estados: [...estados, { sigla: 'RJ', nome: 'Rio de Janeiro' }],
        municipios: [...municipios, { id: '3304557', nome: 'Rio de Janeiro', uf: 'ZZ' }],
        farmacias: [{ ...farmacias[0], nome: 'Nome Alterado' }],
        sincronizacao: { ufs: ['PB', 'SP'], credenciadas: ['f1'] },
      }),
    ).rejects.toThrow();

    expect((await pool.query('SELECT sigla FROM estados ORDER BY sigla')).rows.map((r) => r.sigla)).toEqual([
      'PB',
      'SP',
    ]);
    expect((await pool.query('SELECT id FROM municipios ORDER BY id')).rows.map((r) => r.id)).toEqual([
      '2504009',
      '3550308',
    ]);
    expect(await idsFarmacias()).toEqual(['f1', 'f2', 'f3']);
    expect((await pool.query("SELECT nome FROM farmacias WHERE id = 'f1'")).rows[0].nome).toBe('Alfa Farma');
  });

  it('desfaz também a remoção já executada quando o COMMIT falha (CA12)', async () => {
    await importarDados(pool, dadosBase);
    // O DELETE roda depois dos upserts; só uma falha no COMMIT prova que ele também é desfeito.
    const poolComCommitQuebrado = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: (sql: string, valores?: unknown[]) =>
            sql === 'COMMIT' ? Promise.reject(new Error('falha no commit')) : client.query(sql, valores),
          release: () => client.release(),
        };
      },
    } as unknown as Pool;

    await expect(
      importarDados(poolComCommitQuebrado, {
        estados,
        municipios,
        farmacias: [{ ...farmacias[0], nome: 'Nome Alterado' }],
        sincronizacao: { ufs: ['PB', 'SP'], credenciadas: ['f1'] },
      }),
    ).rejects.toThrow('falha no commit');

    expect(await idsFarmacias()).toEqual(['f1', 'f2', 'f3']);
    expect((await pool.query("SELECT nome FROM farmacias WHERE id = 'f1'")).rows[0].nome).toBe('Alfa Farma');
  });
});
