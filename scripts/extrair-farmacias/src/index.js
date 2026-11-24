import { lerArgumentos } from './args.js';
import { obterPlanilha } from './fontes/pfpb.js';
import { extrair } from './extrair.js';
import { gravarSaida } from './saida.js';

try {
  const args = lerArgumentos();
  console.log(args.arquivo ? `Lendo ${args.arquivo}...` : 'Baixando a planilha oficial do PFPB...');
  const planilha = await obterPlanilha(args.arquivo);

  const resultado = await extrair(planilha, { uf: args.uf, municipio: args.municipio, geocodificar: args.geocodificar });
  await gravarSaida(args.saida, resultado);

  const m = resultado.metadados;
  console.log(`\nPronto em ./${args.saida}: ${m.comCoordenada} de ${m.totalFarmacias} farmácias com coordenada (${m.cobertura}%): ${m.viaCnes} pelo CNES e ${m.viaGeocodificacao} geocodificadas.`);
  if (m.viaGeocodificacao) console.log('Confira as geocodificadas em geocodificadas.csv.');
  if (m.semCoordenada) console.log(`As ${m.semCoordenada} sem coordenada estão em sem-coordenadas.csv.`);
  const { falhas } = m;
  if (falhas.cnes || falhas.openStreetMap) {
    console.log(`Aviso: extração parcial por falha nas fontes. Farmácias sem consulta ao CNES: ${falhas.cnes}; sem consulta ao OpenStreetMap: ${falhas.openStreetMap}. Elas estão em sem-coordenadas.csv; rode a extração de novo para completá-las.`);
  }
} catch (erro) {
  console.error(`Erro: ${erro.message}`);
  process.exitCode = 1;
}
