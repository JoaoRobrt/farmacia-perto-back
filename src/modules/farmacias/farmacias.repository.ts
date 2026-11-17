import type { Farmacia } from '../../shared/types';

export interface FarmaciasRepository {
  listarPorMunicipio(municipioId: string): Promise<Farmacia[]>;
}
