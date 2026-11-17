import { criarApp } from './app';
import { criarEstadosRepositoryMock } from './modules/estados/estados.repository.mock';
import { criarFarmaciasRepositoryMock } from './modules/farmacias/farmacias.repository.mock';
import { criarMunicipiosRepositoryMock } from './modules/municipios/municipios.repository.mock';
import { carregarArquivoEnv, lerConfig } from './shared/config';

carregarArquivoEnv();
const { porta, corsOrigin } = lerConfig();
const app = criarApp(
  {
    estados: criarEstadosRepositoryMock(),
    municipios: criarMunicipiosRepositoryMock(),
    farmacias: criarFarmaciasRepositoryMock(),
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
