import type { RequestHandler } from 'express';
import type { MunicipiosService } from './municipios.service';

export function criarMunicipiosController(service: MunicipiosService): {
  listarPorUf: RequestHandler<{ uf: string }>;
} {
  return {
    listarPorUf: async (req, res) => {
      res.json(await service.listarPorUf(req.params.uf));
    },
  };
}
