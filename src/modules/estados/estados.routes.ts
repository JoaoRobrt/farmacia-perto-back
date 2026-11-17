import { Router } from 'express';
import type { criarEstadosController } from './estados.controller';

export function criarEstadosRoutes(controller: ReturnType<typeof criarEstadosController>): Router {
  const router = Router();
  router.get('/estados', controller.listar);
  return router;
}
