import type { Pool } from 'pg';
import type { Farmacia } from '../../shared/types';
import type { FarmaciasRepository } from './farmacias.repository';

export function criarFarmaciasRepositoryPg(pool: Pool): FarmaciasRepository {
  return {
    async listarPorMunicipio(municipioId) {
      const resultado = await pool.query<Farmacia>(
        `SELECT id, nome, endereco, bairro, municipio_id AS "municipioId", latitude, longitude
         FROM farmacias
         WHERE municipio_id = $1
         ORDER BY nome`,
        [municipioId],
      );
      return resultado.rows;
    },
  };
}
