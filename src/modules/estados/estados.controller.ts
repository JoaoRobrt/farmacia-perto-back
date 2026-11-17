import type { RequestHandler } from 'express';
import type { EstadosService } from './estados.service';

export function criarEstadosController(service: EstadosService): { listar: RequestHandler } {
  return {
    listar: async (_req, res) => {
      res.json(await service.listar());
    },
  };
}
