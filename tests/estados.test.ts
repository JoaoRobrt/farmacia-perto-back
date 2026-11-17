import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app';
import { estados } from '../src/data/estados';
import { criarEstadosRepositoryMock } from '../src/modules/estados/estados.repository.mock';
import type { EstadosRepository } from '../src/modules/estados/estados.repository';
import { criarEstadosService } from '../src/modules/estados/estados.service';
import { criarFarmaciasRepositoryMock } from '../src/modules/farmacias/farmacias.repository.mock';
import { criarMunicipiosRepositoryMock } from '../src/modules/municipios/municipios.repository.mock';
import { ErroHttp } from '../src/shared/errors';

function appCom(repository: EstadosRepository) {
  return criarApp(
    {
      estados: repository,
      municipios: criarMunicipiosRepositoryMock(),
      farmacias: criarFarmaciasRepositoryMock(),
    },
    { corsOrigin: '*' },
  );
}

describe('GET /estados', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna 200 com os 27 estados, cada um apenas com sigla e nome', async () => {
    const res = await request(appCom(criarEstadosRepositoryMock())).get('/estados');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(27);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual(['nome', 'sigla']);
    }
    expect(res.body).toContainEqual({ sigla: 'PB', nome: 'Paraíba' });
  });

  it('retorna siglas únicas', async () => {
    const res = await request(appCom(criarEstadosRepositoryMock())).get('/estados');
    const siglas = res.body.map((e: { sigla: string }) => e.sigla);
    expect(new Set(siglas).size).toBe(siglas.length);
  });

  it('retorna o mesmo conteúdo de src/data/estados', async () => {
    const res = await request(appCom(criarEstadosRepositoryMock())).get('/estados');
    expect(res.body).toEqual(estados);
  });

  it('retorna 200 com lista vazia quando o repository não tem estados', async () => {
    const vazio: EstadosRepository = {
      listar: async () => [],
      buscarPorSigla: async () => undefined,
    };
    const res = await request(appCom(vazio)).get('/estados');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna 500 genérico quando o repository falha', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const falho: EstadosRepository = {
      listar: () => Promise.reject(new Error('falha na fonte')),
      buscarPorSigla: async () => undefined,
    };
    const res = await request(appCom(falho)).get('/estados');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ mensagem: 'Erro interno do servidor.' });
    expect(res.text).not.toContain('falha na fonte');
    expect(spy).toHaveBeenCalled();
  });
});

describe('estadosService.obterPorSigla', () => {
  const service = criarEstadosService(criarEstadosRepositoryMock());

  it.each(['PB', 'pb', ' pb '])('devolve a Paraíba para "%s"', async (uf) => {
    await expect(service.obterPorSigla(uf)).resolves.toEqual({ sigla: 'PB', nome: 'Paraíba' });
  });

  it.each(['', 'P', 'PBA', 'P1', 'Pá'])('rejeita com 400 a UF inválida "%s"', async (uf) => {
    const erro = await service.obterPorSigla(uf).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(400);
    expect(erro.message).toBe('UF inválida. Informe a sigla com 2 letras, por exemplo PB.');
  });

  it('rejeita com 404 quando a UF não existe', async () => {
    const erro = await service.obterPorSigla('XX').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(404);
    expect(erro.message).toBe('UF não encontrada.');
  });
});

describe('criarEstadosRepositoryMock', () => {
  it('devolve cópias: mutar o resultado não afeta chamadas seguintes', async () => {
    const repository = criarEstadosRepositoryMock();
    const primeira = await repository.listar();
    primeira[0]!.nome = 'Alterado';
    primeira.pop();
    const segunda = await repository.listar();
    expect(segunda).toEqual(estados);
  });
});
