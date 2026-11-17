import type { Pool } from 'pg';
import type { Estado, Farmacia, Municipio } from '../shared/types';

export type DadosImportacao = {
  estados: unknown;
  municipios: unknown;
  farmacias: unknown;
};

export type ResumoImportacao = {
  estados: number;
  municipios: number;
  farmacias: number;
  farmaciasRemovidas: number;
};

type Campo = { nome: string; tipo: 'texto' | 'id' | 'numero' };

const CAMPOS_ESTADO: Campo[] = [
  { nome: 'sigla', tipo: 'id' },
  { nome: 'nome', tipo: 'texto' },
];

const CAMPOS_MUNICIPIO: Campo[] = [
  { nome: 'id', tipo: 'id' },
  { nome: 'nome', tipo: 'texto' },
  { nome: 'uf', tipo: 'id' },
];

const CAMPOS_FARMACIA: Campo[] = [
  { nome: 'id', tipo: 'id' },
  { nome: 'nome', tipo: 'texto' },
  { nome: 'endereco', tipo: 'texto' },
  { nome: 'bairro', tipo: 'texto' },
  { nome: 'municipioId', tipo: 'id' },
  { nome: 'latitude', tipo: 'numero' },
  { nome: 'longitude', tipo: 'numero' },
];

function validarLista<T>(arquivo: string, valor: unknown, campos: Campo[]): T[] {
  if (!Array.isArray(valor)) {
    throw new Error(`${arquivo}: o conteúdo deve ser uma lista (array).`);
  }
  valor.forEach((item: unknown, indice) => {
    const onde = `${arquivo}, item ${indice}`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`${onde}: deve ser um objeto.`);
    }
    const registro = item as Record<string, unknown>;
    for (const { nome, tipo } of campos) {
      const campo = registro[nome];
      if (campo === undefined || campo === null) {
        throw new Error(`${onde}: campo "${nome}" ausente.`);
      }
      if (tipo === 'numero') {
        if (typeof campo !== 'number' || !Number.isFinite(campo)) {
          throw new Error(`${onde}: campo "${nome}" deve ser um número finito.`);
        }
      } else if (typeof campo !== 'string') {
        throw new Error(`${onde}: campo "${nome}" deve ser texto.`);
      } else if (tipo === 'id' && campo.trim() === '') {
        throw new Error(`${onde}: campo "${nome}" não pode ser vazio.`);
      }
    }
  });
  return valor as T[];
}

function validar(dados: DadosImportacao) {
  const estados = validarLista<Estado>('estados.json', dados.estados, CAMPOS_ESTADO);
  const municipios = validarLista<Municipio>('municipios.json', dados.municipios, CAMPOS_MUNICIPIO);
  const farmacias = validarLista<Farmacia>('farmacias.json', dados.farmacias, CAMPOS_FARMACIA);

  const idsMunicipios = new Set(municipios.map((m) => m.id));
  farmacias.forEach((farmacia, indice) => {
    if (!idsMunicipios.has(farmacia.municipioId)) {
      throw new Error(
        `farmacias.json, item ${indice}: municipioId "${farmacia.municipioId}" não existe em municipios.json.`,
      );
    }
  });

  return { estados, municipios, farmacias };
}

export async function importarDados(pool: Pool, dados: DadosImportacao): Promise<ResumoImportacao> {
  const { estados, municipios, farmacias } = validar(dados);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const estado of estados) {
      await client.query(
        `INSERT INTO estados (sigla, nome) VALUES ($1, $2)
         ON CONFLICT (sigla) DO UPDATE SET nome = EXCLUDED.nome`,
        [estado.sigla, estado.nome],
      );
    }

    for (const municipio of municipios) {
      await client.query(
        `INSERT INTO municipios (id, nome, uf) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET nome = EXCLUDED.nome, uf = EXCLUDED.uf`,
        [municipio.id, municipio.nome, municipio.uf],
      );
    }

    for (const farmacia of farmacias) {
      await client.query(
        `INSERT INTO farmacias (id, nome, endereco, bairro, municipio_id, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           nome = EXCLUDED.nome,
           endereco = EXCLUDED.endereco,
           bairro = EXCLUDED.bairro,
           municipio_id = EXCLUDED.municipio_id,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude`,
        [
          farmacia.id,
          farmacia.nome,
          farmacia.endereco,
          farmacia.bairro,
          farmacia.municipioId,
          farmacia.latitude,
          farmacia.longitude,
        ],
      );
    }

    // Só os municípios importados são sincronizados: a extração pode ter sido filtrada.
    const remocao = await client.query(
      `DELETE FROM farmacias
       WHERE municipio_id = ANY($1::varchar[]) AND NOT (id = ANY($2::text[]))`,
      [municipios.map((m) => m.id), farmacias.map((f) => f.id)],
    );

    await client.query('COMMIT');

    return {
      estados: estados.length,
      municipios: municipios.length,
      farmacias: farmacias.length,
      farmaciasRemovidas: remocao.rowCount ?? 0,
    };
  } catch (erro) {
    // Uma falha no ROLLBACK (conexão caída) não pode esconder o erro original.
    await client.query('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    client.release();
  }
}
