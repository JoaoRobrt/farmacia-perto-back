import type { Municipio } from '../../shared/types';

export interface MunicipiosRepository {
  listarPorUf(uf: string): Promise<Municipio[]>;
  buscarPorId(id: string): Promise<Municipio | undefined>;
}
