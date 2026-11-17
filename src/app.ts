import cors from 'cors';
import express, { type Express } from 'express';
import { criarEstadosController } from './modules/estados/estados.controller';
import type { EstadosRepository } from './modules/estados/estados.repository';
import { criarEstadosRoutes } from './modules/estados/estados.routes';
import { criarEstadosService } from './modules/estados/estados.service';
import { rotaNaoEncontrada } from './shared/middlewares/rotaNaoEncontrada';
import { tratarErros } from './shared/middlewares/tratarErros';

export type Repositories = {
  estados: EstadosRepository;
};

export type OpcoesApp = {
  corsOrigin: string;
};

function origensCors(corsOrigin: string): string | string[] {
  if (!corsOrigin.includes(',')) {
    return corsOrigin;
  }
  return corsOrigin
    .split(',')
    .map((origem) => origem.trim())
    .filter((origem) => origem !== '');
}

export function criarApp(repositories: Repositories, opcoes: OpcoesApp): Express {
  const app = express();

  app.use(cors({ origin: origensCors(opcoes.corsOrigin) }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  const estadosService = criarEstadosService(repositories.estados);
  app.use(criarEstadosRoutes(criarEstadosController(estadosService)));

  app.use(rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
