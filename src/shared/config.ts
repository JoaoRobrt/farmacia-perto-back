import fs from 'node:fs';

export type Config = {
  porta: number;
  corsOrigin: string;
  databaseUrl: string;
};

const PORTA_PADRAO = 3000;
const CORS_ORIGIN_PADRAO = '*';

function lerPorta(valor: string | undefined): number {
  if (valor === undefined || valor.trim() === '') {
    return PORTA_PADRAO;
  }
  const texto = valor.trim();
  const porta = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(porta) || porta <= 0) {
    throw new Error(`PORT inválida: "${valor}". Informe um número inteiro positivo.`);
  }
  return porta;
}

function lerDatabaseUrl(valor: string | undefined): string {
  const url = valor?.trim();
  if (!url) {
    throw new Error('DATABASE_URL não informada. Defina a URL de conexão do PostgreSQL no .env.');
  }
  return url;
}

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const corsOrigin = env.CORS_ORIGIN?.trim();
  return {
    porta: lerPorta(env.PORT),
    corsOrigin: corsOrigin ? corsOrigin : CORS_ORIGIN_PADRAO,
    databaseUrl: lerDatabaseUrl(env.DATABASE_URL),
  };
}

export function carregarArquivoEnv(caminho = '.env'): void {
  if (fs.existsSync(caminho)) {
    process.loadEnvFile(caminho);
  }
}
