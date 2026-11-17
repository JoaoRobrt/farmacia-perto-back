import { estados } from '../../data/estados';
import type { EstadosRepository } from './estados.repository';

export function criarEstadosRepositoryMock(): EstadosRepository {
  return {
    async listar() {
      return estados.map((estado) => ({ ...estado }));
    },
    async buscarPorSigla(sigla) {
      const estado = estados.find((item) => item.sigla === sigla);
      return estado ? { ...estado } : undefined;
    },
  };
}
