import fs from 'node:fs';

export type Config = {
  porta: number;
  corsOrigin: string;
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

export function lerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const corsOrigin = env.CORS_ORIGIN?.trim();
  return {
    porta: lerPorta(env.PORT),
    corsOrigin: corsOrigin ? corsOrigin : CORS_ORIGIN_PADRAO,
  };
}

export function carregarArquivoEnv(caminho = '.env'): void {
  if (fs.existsSync(caminho)) {
    process.loadEnvFile(caminho);
  }
}
