import { naoEncontrado, requisicaoInvalida } from '../../shared/errors';
import type { Municipio } from '../../shared/types';
import type { EstadosService } from '../estados/estados.service';
import type { MunicipiosRepository } from './municipios.repository';

const TAMANHO_MAXIMO_ID = 100;

export function criarMunicipiosService(
  repository: MunicipiosRepository,
  estadosService: EstadosService,
) {
  return {
    async listarPorUf(uf: string): Promise<Municipio[]> {
      const estado = await estadosService.obterPorSigla(uf);
      return repository.listarPorUf(estado.sigla);
    },

    async obterPorId(id: string): Promise<Municipio> {
      const idNormalizado = id.trim();
      if (idNormalizado === '' || idNormalizado.length > TAMANHO_MAXIMO_ID) {
        throw requisicaoInvalida('Id de município inválido.');
      }
      const municipio = await repository.buscarPorId(idNormalizado);
      if (!municipio) {
        throw naoEncontrado('Município não encontrado.');
      }
      return municipio;
    },
  };
}

export type MunicipiosService = ReturnType<typeof criarMunicipiosService>;
