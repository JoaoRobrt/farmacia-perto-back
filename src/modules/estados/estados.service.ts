import { naoEncontrado, requisicaoInvalida } from '../../shared/errors';
import type { Estado } from '../../shared/types';
import type { EstadosRepository } from './estados.repository';

export function criarEstadosService(repository: EstadosRepository) {
  return {
    listar(): Promise<Estado[]> {
      return repository.listar();
    },

    async obterPorSigla(uf: string): Promise<Estado> {
      const sigla = uf.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(sigla)) {
        throw requisicaoInvalida('UF inválida. Informe a sigla com 2 letras, por exemplo PB.');
      }
      const estado = await repository.buscarPorSigla(sigla);
      if (!estado) {
        throw naoEncontrado('UF não encontrada.');
      }
      return estado;
    },
  };
}

export type EstadosService = ReturnType<typeof criarEstadosService>;
