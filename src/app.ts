import cors from 'cors';
import express, { type Express } from 'express';
import { rotaNaoEncontrada } from './shared/middlewares/rotaNaoEncontrada';
import { tratarErros } from './shared/middlewares/tratarErros';

export type Repositories = Record<string, never>;

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

export function criarApp(_repositories: Repositories, opcoes: OpcoesApp): Express {
  const app = express();

  app.use(cors({ origin: origensCors(opcoes.corsOrigin) }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use(rotaNaoEncontrada);
  app.use(tratarErros);

  return app;
}
