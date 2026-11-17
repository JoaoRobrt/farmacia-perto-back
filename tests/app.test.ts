import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app';
import { criarEstadosRepositoryMock } from '../src/modules/estados/estados.repository.mock';
import { criarMunicipiosRepositoryMock } from '../src/modules/municipios/municipios.repository.mock';
import { ErroHttp, naoEncontrado, requisicaoInvalida } from '../src/shared/errors';
import { tratarErros } from '../src/shared/middlewares/tratarErros';

function criarAppDeTeste(opcoes: Parameters<typeof criarApp>[1]) {
  return criarApp(
    { estados: criarEstadosRepositoryMock(), municipios: criarMunicipiosRepositoryMock() },
    opcoes,
  );
}

describe('criarApp', () => {
  const app = criarAppDeTeste({ corsOrigin: '*' });

  it('responde 200 com status ok em GET /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('retorna 404 com mensagem para rota desconhecida', async () => {
    const res = await request(app).get('/rota-que-nao-existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'Rota não encontrada.' });
  });

  it('retorna 404 para método não registrado em rota existente', async () => {
    const res = await request(app).post('/health');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'Rota não encontrada.' });
  });
});

describe('CORS', () => {
  it('permite qualquer origem quando corsOrigin é *', async () => {
    const app = criarAppDeTeste({ corsOrigin: '*' });
    const res = await request(app).get('/health').set('Origin', 'http://qualquer.com');
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  it('reflete a origem quando corsOrigin é uma única origem', async () => {
    const app = criarAppDeTeste({ corsOrigin: 'http://localhost:8081' });
    const res = await request(app).get('/health').set('Origin', 'http://localhost:8081');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('aceita origem presente em lista separada por vírgula', async () => {
    const app = criarAppDeTeste({ corsOrigin: 'http://a.com, http://b.com' });
    const res = await request(app).get('/health').set('Origin', 'http://b.com');
    expect(res.headers['access-control-allow-origin']).toBe('http://b.com');
  });

  it('não envia Access-Control-Allow-Origin para origem fora da lista', async () => {
    const app = criarAppDeTeste({ corsOrigin: 'http://a.com, http://b.com' });
    const res = await request(app).get('/health').set('Origin', 'http://c.com');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('tratarErros', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function montarApp() {
    const app = express();
    app.get('/nao-encontrado', () => {
      throw naoEncontrado('X não encontrado.');
    });
    app.get('/invalido', () => {
      throw requisicaoInvalida('Parâmetro inválido.');
    });
    app.get('/conflito', () => {
      throw new ErroHttp(409, 'Conflito de dados.');
    });
    app.get('/interno', () => {
      throw new Error('detalhe interno secreto');
    });
    app.get('/async', async () => {
      throw new Error('falha async secreta');
    });
    app.get('/async-http', async () => {
      throw naoEncontrado('Recurso async não encontrado.');
    });
    app.use(tratarErros);
    return app;
  }

  it('responde 404 com a mensagem de naoEncontrado', async () => {
    const res = await request(montarApp()).get('/nao-encontrado');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'X não encontrado.' });
  });

  it('responde 400 com a mensagem de requisicaoInvalida', async () => {
    const res = await request(montarApp()).get('/invalido');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ mensagem: 'Parâmetro inválido.' });
  });

  it('responde com o status e a mensagem de um ErroHttp arbitrário', async () => {
    const res = await request(montarApp()).get('/conflito');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ mensagem: 'Conflito de dados.' });
  });

  it('responde 500 genérico sem vazar o erro interno e registra o erro', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(montarApp()).get('/interno');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ mensagem: 'Erro interno do servidor.' });
    expect(res.text).not.toContain('detalhe interno secreto');
    expect(spy).toHaveBeenCalledTimes(1);
    const registrado = spy.mock.calls[0]?.[0] as Error;
    expect(registrado).toBeInstanceOf(Error);
    expect(registrado.message).toBe('detalhe interno secreto');
  });

  it('encaminha rejeição de handler async ao middleware de erro como 500', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(montarApp()).get('/async');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ mensagem: 'Erro interno do servidor.' });
    expect(res.text).not.toContain('falha async secreta');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('preserva o status de ErroHttp lançado em handler async', async () => {
    const res = await request(montarApp()).get('/async-http');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'Recurso async não encontrado.' });
  });
});
