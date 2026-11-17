import type { RequestHandler } from 'express';
import type { FarmaciasService } from './farmacias.service';

export function criarFarmaciasController(service: FarmaciasService): {
  listarPorMunicipio: RequestHandler<{ id: string }>;
} {
  return {
    listarPorMunicipio: async (req, res) => {
      res.json(await service.listarPorMunicipio(req.params.id));
    },
  };
}
