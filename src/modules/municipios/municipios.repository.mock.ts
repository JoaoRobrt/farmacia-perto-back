import { municipios } from '../../data/municipios';
import type { MunicipiosRepository } from './municipios.repository';

export function criarMunicipiosRepositoryMock(): MunicipiosRepository {
  return {
    async listarPorUf(uf) {
      return municipios
        .filter((municipio) => municipio.uf === uf)
        .map((municipio) => ({ ...municipio }));
    },
    async buscarPorId(id) {
      const municipio = municipios.find((item) => item.id === id);
      return municipio ? { ...municipio } : undefined;
    },
  };
}
