import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { carregarArquivoEnv, lerConfig } from '../src/shared/config';

describe('lerConfig', () => {
  it('usa porta 3000 e CORS * por padrão', () => {
    expect(lerConfig({})).toEqual({ porta: 3000, corsOrigin: '*' });
  });

  it.each(['', '   '])('usa porta 3000 quando PORT é %j', (valor) => {
    expect(lerConfig({ PORT: valor }).porta).toBe(3000);
  });

  it('lê a porta de PORT', () => {
    expect(lerConfig({ PORT: '8080' }).porta).toBe(8080);
  });

  it('apara espaços de PORT válida', () => {
    expect(lerConfig({ PORT: ' 8080 ' }).porta).toBe(8080);
  });

  it('apara espaços nas pontas de CORS_ORIGIN', () => {
    expect(lerConfig({ CORS_ORIGIN: '  http://localhost:8081  ' }).corsOrigin).toBe(
      'http://localhost:8081',
    );
  });

  it.each(['', '   '])('usa * quando CORS_ORIGIN é %j', (valor) => {
    expect(lerConfig({ CORS_ORIGIN: valor }).corsOrigin).toBe('*');
  });

  it.each(['0', '-1', '3.5', 'abc', '80a'])(
    'lança erro mencionando o valor para PORT %j',
    (valor) => {
      expect(() => lerConfig({ PORT: valor })).toThrow(`"${valor}"`);
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
