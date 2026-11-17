import type { Pool } from 'pg';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS estados (
  sigla char(2) PRIMARY KEY,
  nome text NOT NULL
);

CREATE TABLE IF NOT EXISTS municipios (
  id varchar(100) PRIMARY KEY,
  nome text NOT NULL,
  uf char(2) NOT NULL REFERENCES estados(sigla)
);

CREATE INDEX IF NOT EXISTS municipios_uf_idx ON municipios (uf);

CREATE TABLE IF NOT EXISTS farmacias (
  id text PRIMARY KEY,
  nome text NOT NULL,
  endereco text NOT NULL,
  bairro text NOT NULL,
  municipio_id varchar(100) NOT NULL REFERENCES municipios(id),
  latitude double precision NOT NULL,
  longitude double precision NOT NULL
);

CREATE INDEX IF NOT EXISTS farmacias_municipio_id_idx ON farmacias (municipio_id);
`;

export async function aplicarSchema(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}
