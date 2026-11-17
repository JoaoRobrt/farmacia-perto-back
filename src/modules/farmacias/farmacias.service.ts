import type { Farmacia } from '../../shared/types';
import type { MunicipiosService } from '../municipios/municipios.service';
import type { FarmaciasRepository } from './farmacias.repository';

export function criarFarmaciasService(
  repository: FarmaciasRepository,
  municipiosService: MunicipiosService,
) {
  return {
    async listarPorMunicipio(id: string): Promise<Farmacia[]> {
      const municipio = await municipiosService.obterPorId(id);
      return repository.listarPorMunicipio(municipio.id);
    },
  };
}

export type FarmaciasService = ReturnType<typeof criarFarmaciasService>;
