import type { ErrorRequestHandler } from 'express';
import { ErroHttp } from '../errors';

export const tratarErros: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ErroHttp) {
    res.status(err.status).json({ mensagem: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ mensagem: 'Erro interno do servidor.' });
};
