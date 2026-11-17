import { defineConfig } from 'vitest/config';

// Os testes de integração compartilham o banco de DATABASE_URL_TEST e o truncam;
// em paralelo, um arquivo apagaria os dados enquanto outro faz as asserções.
export default defineConfig({
  // scripts/extrair-farmacias tem testes próprios, com node:test.
  test: { fileParallelism: false, include: ['tests/**/*.test.ts'] },
});
