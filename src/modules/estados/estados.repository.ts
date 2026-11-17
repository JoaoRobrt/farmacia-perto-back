import type { Estado } from '../../shared/types';

export interface EstadosRepository {
  listar(): Promise<Estado[]>;
  buscarPorSigla(sigla: string): Promise<Estado | undefined>;
}
