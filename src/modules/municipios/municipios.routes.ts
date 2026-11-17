import { Router } from 'express';
import type { criarMunicipiosController } from './municipios.controller';

export function criarMunicipiosRoutes(
  controller: ReturnType<typeof criarMunicipiosController>,
): Router {
  const router = Router();
  router.get('/estados/:uf/municipios', controller.listarPorUf);
  return router;
}
