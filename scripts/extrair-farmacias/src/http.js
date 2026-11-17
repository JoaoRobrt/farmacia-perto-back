const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch com timeout e novas tentativas para erros de rede e 5xx/429. */
export async function buscar(url, { tentativas = 3, timeoutMs = 30000, headers } = {}) {
  let ultimoErro;
  for (let i = 1; i <= tentativas; i++) {
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers });
      if (resposta.ok) return resposta;
      if (resposta.status < 500 && resposta.status !== 429) {
        throw new Error(`HTTP ${resposta.status} em ${url}`);
      }
      ultimoErro = new Error(`HTTP ${resposta.status} em ${url}`);
    } catch (erro) {
      if (erro.message.startsWith('HTTP 4')) throw erro;
      ultimoErro = erro;
    }
    await esperar(1000 * i);
  }
  throw new Error(`Falha ao acessar ${url} após ${tentativas} tentativas (${ultimoErro.message}).`);
}

export async function buscarJson(url, opcoes) {
  return (await buscar(url, opcoes)).json();
}

export { esperar };
