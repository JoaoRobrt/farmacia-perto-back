import { Pool } from 'pg';

export function criarPool(databaseUrl: string): Pool {
  const pool = new Pool({ connectionString: databaseUrl });
  // Sem este handler, um erro em conexão ociosa (ex.: Postgres caiu) derruba o processo.
  pool.on('error', (erro) => {
    console.error('Erro em conexão ociosa do pool do Postgres:', erro.message);
  });
  return pool;
}
