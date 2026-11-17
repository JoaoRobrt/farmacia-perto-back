import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { carregarArquivoEnv, lerConfig } from '../src/shared/config';

const DATABASE_URL = 'postgres://usuario:senha@localhost:5432/banco';

describe('lerConfig', () => {
  it('usa porta 3000 e CORS * por padrão', () => {
    expect(lerConfig({ DATABASE_URL })).toEqual({
      porta: 3000,
      corsOrigin: '*',
      databaseUrl: DATABASE_URL,
    });
  });

  it.each(['', '   '])('usa porta 3000 quando PORT é %j', (valor) => {
    expect(lerConfig({ DATABASE_URL, PORT: valor }).porta).toBe(3000);
  });

  it('lê a porta de PORT', () => {
    expect(lerConfig({ DATABASE_URL, PORT: '8080' }).porta).toBe(8080);
  });

  it('apara espaços de PORT válida', () => {
    expect(lerConfig({ DATABASE_URL, PORT: ' 8080 ' }).porta).toBe(8080);
  });

  it('apara espaços nas pontas de CORS_ORIGIN', () => {
    const config = lerConfig({ DATABASE_URL, CORS_ORIGIN: '  http://localhost:8081  ' });
    expect(config.corsOrigin).toBe('http://localhost:8081');
  });

  it.each(['', '   '])('usa * quando CORS_ORIGIN é %j', (valor) => {
    expect(lerConfig({ DATABASE_URL, CORS_ORIGIN: valor }).corsOrigin).toBe('*');
  });

  it('lê e apara a DATABASE_URL', () => {
    expect(lerConfig({ DATABASE_URL: `  ${DATABASE_URL}  ` }).databaseUrl).toBe(DATABASE_URL);
  });

  it.each([undefined, '', '   '])('lança erro mencionando DATABASE_URL quando é %j', (valor) => {
    expect(() => lerConfig({ DATABASE_URL: valor })).toThrow('DATABASE_URL');
  });

  it.each(['0', '-1', '3.5', 'abc', '80a'])(
    'lança erro mencionando o valor para PORT %j',
    (valor) => {
      expect(() => lerConfig({ DATABASE_URL, PORT: valor })).toThrow(`"${valor}"`);
    },
  );
});

describe('carregarArquivoEnv', () => {
  const chave = 'TESTE_FARMACIA_PERTO';
  let pasta: string | undefined;

  afterEach(() => {
    delete process.env[chave];
    if (pasta) {
      fs.rmSync(pasta, { recursive: true, force: true });
      pasta = undefined;
    }
  });

  it('não lança nem altera o ambiente quando o arquivo não existe', () => {
    const antes = { ...process.env };
    const inexistente = path.join(os.tmpdir(), 'farmacia-perto-inexistente', '.env');
    expect(() => carregarArquivoEnv(inexistente)).not.toThrow();
    expect(process.env).toEqual(antes);
  });

  it('carrega as variáveis de um arquivo .env existente', () => {
    pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'farmacia-perto-'));
    const arquivo = path.join(pasta, '.env');
    fs.writeFileSync(arquivo, `${chave}=valor\n`);
    expect(process.env[chave]).toBeUndefined();
    carregarArquivoEnv(arquivo);
    expect(process.env[chave]).toBe('valor');
  });
});
