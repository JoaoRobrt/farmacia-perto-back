import { criarApp } from './app';
import { carregarArquivoEnv, lerConfig } from './shared/config';

carregarArquivoEnv();
const { porta, corsOrigin } = lerConfig();
const app = criarApp({}, { corsOrigin });

// No Express 5, falhas como porta ocupada chegam ao callback em vez de derrubar o processo.
app.listen(porta, (erro) => {
  if (erro) {
    throw erro;
  }
  console.log(`API ouvindo na porta ${porta}`);
});
