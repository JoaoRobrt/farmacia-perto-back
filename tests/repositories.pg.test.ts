import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarPool } from '../src/db/pool';
import { aplicarSchema } from '../src/db/schema';
import { criarEstadosRepositoryPg } from '../src/modules/estados/estados.repository.pg';
import { criarFarmaciasRepositoryPg } from '../src/modules/farmacias/farmacias.repository.pg';
import { criarMunicipiosRepositoryPg } from '../src/modules/municipios/municipios.repository.pg';
import { carregarArquivoEnv } from '../src/shared/config';

carregarArquivoEnv();
const url = process.env.DATABASE_URL_TEST ?? '';

describe.skipIf(!url)('repositories Postgres', () => {
  let pool: Pool;

  const limpar = () => pool.query('TRUNCATE farmacias, municipios, estados');

  beforeAll(async () => {
    if (url.trim() === process.env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL_TEST não pode ser igual a DATABASE_URL: os testes apagam os dados.');
    }
    pool = criarPool(url);
    await aplicarSchema(pool);
    await aplicarSchema(pool);
    await limpar();
    await pool.query(
      `INSERT INTO estados (sigla, nome) VALUES
         ('SP', 'São Paulo'), ('AC', 'Acre'), ('PB', 'Paraíba'), ('RR', 'Roraima')`,
    );
    await pool.query(
      `INSERT INTO municipios (id, nome, uf) VALUES
         ('2504009', 'Campina Grande', 'PB'),
         ('2507507', 'João Pessoa', 'PB'),
         ('2501104', 'Areia', 'PB'),
         ('3550308', 'São Paulo', 'SP')`,
    );
    await pool.query(
      `INSERT INTO farmacias (id, nome, endereco, bairro, municipio_id, latitude, longitude) VALUES
         ('f3', 'Zeta Farma', 'Rua C, 30', 'Centro', '2504009', -7.230072, -35.881103),
         ('f1', 'Alfa Farma', 'Rua A, 10', 'Catolé', '2504009', -7.2418, -35.8911),
         ('f2', 'Meio Farma', 'Rua B, 20', 'Bodocongó', '2504009', -7.2147, -35.9087),
         ('f4', 'Outra Cidade', 'Av. Paulista, 1', 'Bela Vista', '3550308', -23.5613, -46.6565)`,
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await limpar();
    await pool.end();
  });

  describe('estados', () => {
    it('lista os estados ordenados por nome', async () => {
      const estados = await criarEstadosRepositoryPg(pool).listar();
      expect(estados).toEqual([
        { sigla: 'AC', nome: 'Acre' },
        { sigla: 'PB', nome: 'Paraíba' },
        { sigla: 'RR', nome: 'Roraima' },
        { sigla: 'SP', nome: 'São Paulo' },
      ]);
    });

    it('busca o estado pela sigla, inclusive o sem municípios', async () => {
      const repo = criarEstadosRepositoryPg(pool);
      expect(await repo.buscarPorSigla('PB')).toEqual({ sigla: 'PB', nome: 'Paraíba' });
      expect(await repo.buscarPorSigla('RR')).toEqual({ sigla: 'RR', nome: 'Roraima' });
    });

    it('devolve undefined quando a sigla não existe', async () => {
      expect(await criarEstadosRepositoryPg(pool).buscarPorSigla('XX')).toBeUndefined();
    });
  });

  describe('municípios', () => {
    it('lista só os municípios da UF, ordenados por nome', async () => {
      const municipios = await criarMunicipiosRepositoryPg(pool).listarPorUf('PB');
      expect(municipios).toEqual([
        { id: '2501104', nome: 'Areia', uf: 'PB' },
        { id: '2504009', nome: 'Campina Grande', uf: 'PB' },
        { id: '2507507', nome: 'João Pessoa', uf: 'PB' },
      ]);
    });

    it('devolve lista vazia para estado sem municípios', async () => {
      expect(await criarMunicipiosRepositoryPg(pool).listarPorUf('AC')).toEqual([]);
    });

    it('busca o município pelo id', async () => {
      expect(await criarMunicipiosRepositoryPg(pool).buscarPorId('3550308')).toEqual({
        id: '3550308',
        nome: 'São Paulo',
        uf: 'SP',
      });
    });

    it('devolve undefined quando o id não existe', async () => {
      expect(await criarMunicipiosRepositoryPg(pool).buscarPorId('0000000')).toBeUndefined();
    });
  });

  describe('farmácias', () => {
    it('lista só as farmácias do município, ordenadas por nome', async () => {
      const farmacias = await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('2504009');
      expect(farmacias).toEqual([
        {
          id: 'f1',
          nome: 'Alfa Farma',
          endereco: 'Rua A, 10',
          bairro: 'Catolé',
          municipioId: '2504009',
          latitude: -7.2418,
          longitude: -35.8911,
        },
        {
          id: 'f2',
          nome: 'Meio Farma',
          endereco: 'Rua B, 20',
          bairro: 'Bodocongó',
          municipioId: '2504009',
          latitude: -7.2147,
          longitude: -35.9087,
        },
        {
          id: 'f3',
          nome: 'Zeta Farma',
          endereco: 'Rua C, 30',
          bairro: 'Centro',
          municipioId: '2504009',
          latitude: -7.230072,
          longitude: -35.881103,
        },
      ]);
    });

    it('devolve municipioId e não municipio_id, com latitude e longitude numéricas', async () => {
      const [farmacia] = await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('3550308');
      expect(Object.keys(farmacia).sort()).toEqual(
        ['bairro', 'endereco', 'id', 'latitude', 'longitude', 'municipioId', 'nome'],
      );
      expect(typeof farmacia.latitude).toBe('number');
      expect(typeof farmacia.longitude).toBe('number');
      expect(farmacia.latitude).toBe(-23.5613);
      expect(farmacia.longitude).toBe(-46.6565);
    });

    it('devolve lista vazia para município sem farmácias', async () => {
      expect(await criarFarmaciasRepositoryPg(pool).listarPorMunicipio('2507507')).toEqual([]);
    });
  });
});
