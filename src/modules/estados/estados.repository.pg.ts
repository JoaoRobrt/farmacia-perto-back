import type { Pool } from 'pg';
import type { Estado } from '../../shared/types';
import type { EstadosRepository } from './estados.repository';

export function criarEstadosRepositoryPg(pool: Pool): EstadosRepository {
  return {
    async listar() {
      const resultado = await pool.query<Estado>('SELECT sigla, nome FROM estados ORDER BY nome');
      return resultado.rows;
    },
    async buscarPorSigla(sigla) {
      const resultado = await pool.query<Estado>(
        'SELECT sigla, nome FROM estados WHERE sigla = $1',
        [sigla],
      );
      return resultado.rows[0];
    },
  };
}
