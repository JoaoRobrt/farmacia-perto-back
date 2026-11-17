import type { Pool } from 'pg';
import type { Municipio } from '../../shared/types';
import type { MunicipiosRepository } from './municipios.repository';

export function criarMunicipiosRepositoryPg(pool: Pool): MunicipiosRepository {
  return {
    async listarPorUf(uf) {
      const resultado = await pool.query<Municipio>(
        'SELECT id, nome, uf FROM municipios WHERE uf = $1 ORDER BY nome',
        [uf],
      );
      return resultado.rows;
    },
    async buscarPorId(id) {
      const resultado = await pool.query<Municipio>(
        'SELECT id, nome, uf FROM municipios WHERE id = $1',
        [id],
      );
      return resultado.rows[0];
    },
  };
}
