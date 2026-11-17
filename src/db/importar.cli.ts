import fs from 'node:fs';
import path from 'node:path';
import { carregarArquivoEnv, lerConfig } from '../shared/config';
import { importarDados } from './importar';
import { criarPool } from './pool';

function lerJson(pasta: string, arquivo: string): unknown {
  const caminho = path.join(pasta, arquivo);
  let conteudo: string;
  try {
    conteudo = fs.readFileSync(caminho, 'utf8');
  } catch {
    throw new Error(`Não foi possível ler ${caminho}.`);
  }
  try {
    return JSON.parse(conteudo);
  } catch {
    throw new Error(`${arquivo}: JSON inválido.`);
  }
}

async function importar(pasta: string): Promise<void> {
  const dados = {
    estados: lerJson(pasta, 'estados.json'),
    municipios: lerJson(pasta, 'municipios.json'),
    farmacias: lerJson(pasta, 'farmacias.json'),
  };
  carregarArquivoEnv();
  const { databaseUrl } = lerConfig();
  const pool = criarPool(databaseUrl);
  try {
    const resumo = await importarDados(pool, dados);
    console.log(
      `Importação concluída: ${resumo.estados} estados, ${resumo.municipios} municípios, ` +
        `${resumo.farmacias} farmácias, ${resumo.farmaciasRemovidas} farmácias removidas.`,
    );
  } finally {
    await pool.end();
  }
}

const pasta = process.argv[2];
if (!pasta) {
  console.error('Uso: npm run db:importar -- <pasta com estados.json, municipios.json e farmacias.json>');
  process.exit(1);
}

importar(pasta).catch((erro: unknown) => {
  // Falhas de conexão do pg podem chegar como AggregateError com mensagem vazia.
  const detalhe = erro instanceof Error ? erro.message : String(erro);
  console.error(
    detalhe ||
      'Não foi possível importar os dados. Verifique DATABASE_URL e se o banco está rodando.',
  );
  process.exit(1);
});
