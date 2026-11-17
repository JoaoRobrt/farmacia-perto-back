import { farmacias } from '../../data/farmacias';
import type { FarmaciasRepository } from './farmacias.repository';

export function criarFarmaciasRepositoryMock(): FarmaciasRepository {
  return {
    async listarPorMunicipio(municipioId) {
      return farmacias
        .filter((farmacia) => farmacia.municipioId === municipioId)
        .map((farmacia) => ({ ...farmacia }));
    },
  };
}
