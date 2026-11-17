import { criarApp } from './app';
import { criarPool } from './db/pool';
import { criarEstadosRepositoryPg } from './modules/estados/estados.repository.pg';
import { criarFarmaciasRepositoryPg } from './modules/farmacias/farmacias.repository.pg';
import { criarMunicipiosRepositoryPg } from './modules/municipios/municipios.repository.pg';
import { carregarArquivoEnv, lerConfig } from './shared/config';

async function iniciar(): Promise<void> {
  carregarArquivoEnv();
  const { porta, corsOrigin, databaseUrl } = lerConfig();
  const pool = criarPool(databaseUrl);

  try {
    await pool.query('SELECT 1');
  } catch {
    // Sem detalhar o erro: a mensagem do pg pode trazer dados da URL de conexão.
    console.error(
      'Não foi possível conectar ao PostgreSQL. Verifique DATABASE_URL e se o banco está rodando.',
    );
    process.exit(1);
  }

  const app = criarApp(
    {
      estados: criarEstadosRepositoryPg(pool),
      municipios: criarMunicipiosRepositoryPg(pool),
      farmacias: criarFarmaciasRepositoryPg(pool),
    },
    { corsOrigin },
  );

  // No Express 5, falhas como porta ocupada chegam ao callback em vez de derrubar o processo.
  app.listen(porta, (erro) => {
    if (erro) {
      throw erro;
    }
    console.log(`API ouvindo na porta ${porta}`);
  });
}

iniciar().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
