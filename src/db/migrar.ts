import { carregarArquivoEnv, lerConfig } from '../shared/config';
import { criarPool } from './pool';
import { aplicarSchema } from './schema';

async function migrar(): Promise<void> {
  carregarArquivoEnv();
  const { databaseUrl } = lerConfig();
  const pool = criarPool(databaseUrl);
  try {
    await aplicarSchema(pool);
    console.log('Schema aplicado.');
  } finally {
    await pool.end();
  }
}

migrar().catch((erro: unknown) => {
  // Falhas de conexão do pg podem chegar como AggregateError com mensagem vazia.
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  console.error(
    detalhe ||
      'Não foi possível aplicar o schema. Verifique DATABASE_URL e se o banco está rodando.',
  );
  process.exit(1);
});
