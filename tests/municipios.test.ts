import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app';
import { municipios } from '../src/data/municipios';
import { criarEstadosRepositoryMock } from '../src/modules/estados/estados.repository.mock';
import { criarFarmaciasRepositoryMock } from '../src/modules/farmacias/farmacias.repository.mock';
import { criarEstadosService } from '../src/modules/estados/estados.service';
import type { MunicipiosRepository } from '../src/modules/municipios/municipios.repository';
import { criarMunicipiosRepositoryMock } from '../src/modules/municipios/municipios.repository.mock';
import { criarMunicipiosService } from '../src/modules/municipios/municipios.service';
import { ErroHttp } from '../src/shared/errors';

function appCom(repository: MunicipiosRepository) {
  return criarApp(
    {
      estados: criarEstadosRepositoryMock(),
      municipios: repository,
      farmacias: criarFarmaciasRepositoryMock(),
    },
    { corsOrigin: '*' },
  );
}

describe('GET /estados/:uf/municipios', () => {
  const app = appCom(criarMunicipiosRepositoryMock());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna 200 com os municípios da PB, cada um apenas com id, nome e uf', async () => {
    const res = await request(app).get('/estados/PB/municipios');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual(['id', 'nome', 'uf']);
      expect(item.uf).toBe('PB');
    }
    expect(res.body).toContainEqual({
      id: 'pb-campina-grande',
      nome: 'Campina Grande',
      uf: 'PB',
    });
    expect(res.body).toEqual(municipios.filter((m) => m.uf === 'PB'));
  });

  it('aceita a UF em minúsculo', async () => {
    const res = await request(app).get('/estados/pb/municipios');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(municipios.filter((m) => m.uf === 'PB'));
  });

  it('aceita a UF com espaços e retorna apenas municípios dela', async () => {
    const res = await request(app).get('/estados/%20pe%20/municipios');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((m: { uf: string }) => m.uf === 'PE')).toBe(true);
    expect(res.body).toEqual(municipios.filter((m) => m.uf === 'PE'));
  });

  it('retorna 200 com lista vazia para UF válida sem municípios no mock', async () => {
    const res = await request(app).get('/estados/AC/municipios');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it.each(['P1', 'P', 'PBA'])('retorna 400 para a UF inválida "%s"', async (uf) => {
    const res = await request(app).get(`/estados/${uf}/municipios`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      mensagem: 'UF inválida. Informe a sigla com 2 letras, por exemplo PB.',
    });
  });

  it('retorna 404 quando a UF não existe', async () => {
    const res = await request(app).get('/estados/XX/municipios');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'UF não encontrada.' });
  });

  it('retorna 500 genérico quando o repository falha', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const falho: MunicipiosRepository = {
      listarPorUf: () => Promise.reject(new Error('falha na fonte')),
      buscarPorId: async () => undefined,
    };
    const res = await request(appCom(falho)).get('/estados/PB/municipios');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ mensagem: 'Erro interno do servidor.' });
    expect(res.text).not.toContain('falha na fonte');
    expect(spy).toHaveBeenCalled();
  });

  it('não consulta o repository de municípios quando a UF não existe', async () => {
    const stub: MunicipiosRepository = {
      listarPorUf: vi.fn(async () => []),
      buscarPorId: vi.fn(async () => undefined),
    };
    const res = await request(appCom(stub)).get('/estados/XX/municipios');
    expect(res.status).toBe(404);
    expect(stub.listarPorUf).not.toHaveBeenCalled();
  });
});

describe('municipiosService.obterPorId', () => {
  const service = criarMunicipiosService(
    criarMunicipiosRepositoryMock(),
    criarEstadosService(criarEstadosRepositoryMock()),
  );

  it.each(['pb-campina-grande', ' pb-campina-grande '])(
    'devolve Campina Grande para "%s"',
    async (id) => {
      await expect(service.obterPorId(id)).resolves.toEqual({
        id: 'pb-campina-grande',
        nome: 'Campina Grande',
        uf: 'PB',
      });
    },
  );

  it.each(['', '   ', 'a'.repeat(101)])('rejeita com 400 o id inválido "%s"', async (id) => {
    const erro = await service.obterPorId(id).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(400);
    expect(erro.message).toBe('Id de município inválido.');
  });

  it.each(['inexistente', 'a'.repeat(100)])('rejeita com 404 o id inexistente "%s"', async (id) => {
    const erro = await service.obterPorId(id).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroHttp);
    expect(erro.status).toBe(404);
    expect(erro.message).toBe('Município não encontrado.');
  });
});

describe('criarMunicipiosRepositoryMock', () => {
  it('devolve cópias: mutar o resultado de listarPorUf não afeta chamadas seguintes', async () => {
    const repository = criarMunicipiosRepositoryMock();
    const primeira = await repository.listarPorUf('PB');
    primeira[0]!.nome = 'Alterado';
    primeira.pop();
    const segunda = await repository.listarPorUf('PB');
    expect(segunda).toEqual(municipios.filter((m) => m.uf === 'PB'));
  });

  it('devolve cópias: mutar o resultado de buscarPorId não afeta chamadas seguintes', async () => {
    const repository = criarMunicipiosRepositoryMock();
    const primeiro = await repository.buscarPorId('pb-campina-grande');
    primeiro!.nome = 'Alterado';
    const segundo = await repository.buscarPorId('pb-campina-grande');
    expect(segundo).toEqual({ id: 'pb-campina-grande', nome: 'Campina Grande', uf: 'PB' });
  });
});
