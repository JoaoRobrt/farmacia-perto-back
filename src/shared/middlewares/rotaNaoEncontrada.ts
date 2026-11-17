import type { RequestHandler } from 'express';

export const rotaNaoEncontrada: RequestHandler = (_req, res) => {
  res.status(404).json({ mensagem: 'Rota não encontrada.' });
};
