import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarApp } from '../src/app';
import { farmacias } from '../src/data/farmacias';
import { criarEstadosRepositoryMock } from '../src/modules/estados/estados.repository.mock';
import type { FarmaciasRepository } from '../src/modules/farmacias/farmacias.repository';
import { criarFarmaciasRepositoryMock } from '../src/modules/farmacias/farmacias.repository.mock';
import { criarMunicipiosRepositoryMock } from '../src/modules/municipios/municipios.repository.mock';

function appCom(repository: FarmaciasRepository) {
  return criarApp(
    {
      estados: criarEstadosRepositoryMock(),
      municipios: criarMunicipiosRepositoryMock(),
      farmacias: repository,
    },
    { corsOrigin: '*' },
  );
}

describe('GET /municipios/:id/farmacias', () => {
  const app = appCom(criarFarmaciasRepositoryMock());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna 200 com as farmácias de Campina Grande, só do município e com os campos de Farmacia', async () => {
    const res = await request(app).get('/municipios/pb-campina-grande/farmacias');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const ids = res.body.map((f: { id: string }) => f.id);
    expect(ids).toContain('cg-01');
    expect(ids).toContain('cg-02');
    expect(ids.some((id: string) => id.startsWith('jp-'))).toBe(false);
    expect(res.body.every((f: { municipioId: string }) => f.municipioId === 'pb-campina-grande')).toBe(true);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual([
        'bairro',
        'endereco',
        'id',
        'latitude',
        'longitude',
        'municipioId',
        'nome',
      ]);
      expect(typeof item.latitude).toBe('number');
      expect(typeof item.longitude).toBe('number');
    }
  });

  it('retorna 200 apenas com as farmácias de João Pessoa', async () => {
    const res = await request(app).get('/municipios/pb-joao-pessoa/farmacias');
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    const ids = res.body.map((f: { id: string }) => f.id);
    expect(ids).toContain('jp-01');
    expect(ids.some((id: string) => id.startsWith('cg-'))).toBe(false);
    expect(res.body.every((f: { municipioId: string }) => f.municipioId === 'pb-joao-pessoa')).toBe(true);
  });

  it('retorna 200 com lista vazia para município existente sem farmácias', async () => {
    const res = await request(app).get('/municipios/pb-patos/farmacias');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('retorna 404 quando o município não existe', async () => {
    const res = await request(app).get('/municipios/xx-nada/farmacias');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ mensagem: 'Município não encontrado.' });
  });

  it.each(['%20', '%20%20', 'a'.repeat(101)])('retorna 400 para o id inválido "%s"', async (id) => {
    const res = await request(app).get(`/municipios/${id}/farmacias`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ mensagem: 'Id de município inválido.' });
  });

  it('aplica trim no id do município e devolve as farmácias dele', async () => {
    const conhecida = { ...farmacias.find((f) => f.id === 'cg-01')! };
    const stub: FarmaciasRepository = {
      listarPorMunicipio: async (municipioId) =>
        municipioId === 'pb-campina-grande' ? [conhecida] : [],
    };
    const res = await request(appCom(stub)).get('/municipios/%20pb-campina-grande%20/farmacias');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([conhecida]);
  });

  it('não consulta o repository de farmácias quando o município não existe', async () => {
    const stub: FarmaciasRepository = {
      listarPorMunicipio: vi.fn(async () => []),
    };
    const res = await request(appCom(stub)).get('/municipios/xx-nada/farmacias');
    expect(res.status).toBe(404);
    expect(stub.listarPorMunicipio).not.toHaveBeenCalled();
  });

  it('retorna 500 genérico, sem detalhes internos, quando o repository falha', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const falho: FarmaciasRepository = {
      listarPorMunicipio: () => Promise.reject(new Error('falha na fonte')),
    };
    const res = await request(appCom(falho)).get('/municipios/pb-campina-grande/farmacias');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ mensagem: 'Erro interno do servidor.' });
    expect(res.text).not.toContain('falha na fonte');
    expect(res.text).not.toContain('at ');
    expect(spy).toHaveBeenCalled();
  });
});

describe('criarFarmaciasRepositoryMock', () => {
  it('devolve cópias: mutar o resultado não altera os dados de src/data', async () => {
    const repository = criarFarmaciasRepositoryMock();
    const snapshot = (await repository.listarPorMunicipio('pb-campina-grande')).map((f) => ({ ...f }));
    const copiaEsperada = snapshot.map((f) => ({ ...f }));

    const primeira = await repository.listarPorMunicipio('pb-campina-grande');
    primeira[0]!.nome = 'Alterado';
    primeira.pop();

    const segunda = await repository.listarPorMunicipio('pb-campina-grande');
    expect(segunda).toEqual(copiaEsperada);
  });
});
