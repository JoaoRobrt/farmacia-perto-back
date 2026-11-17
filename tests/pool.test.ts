import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarPool } from '../src/db/pool';

const senha = 'senhaSecreta123';
const url = `postgres://usuario:${senha}@localhost:5432/banco_ficticio`;

describe('criarPool', () => {
  let pool: Pool | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    await pool?.end();
    pool = undefined;
  });

  it('registra o erro de conexão ociosa sem lançar e sem vazar a URL ou a senha', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    pool = criarPool(url);

    expect(() => pool!.emit('error', new Error('conexão perdida'))).not.toThrow();

    expect(espiao).toHaveBeenCalledTimes(1);
    const argumentos = espiao.mock.calls[0];
    expect(argumentos).toContain('conexão perdida');
    const texto = argumentos.map(String).join(' ');
    expect(texto).not.toContain(senha);
    expect(texto).not.toContain(url);
  });
});
