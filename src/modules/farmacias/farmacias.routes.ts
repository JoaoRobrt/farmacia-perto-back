import { Router } from 'express';
import type { criarFarmaciasController } from './farmacias.controller';

export function criarFarmaciasRoutes(
  controller: ReturnType<typeof criarFarmaciasController>,
): Router {
  const router = Router();
  router.get('/municipios/:id/farmacias', controller.listarPorMunicipio);
  return router;
}
