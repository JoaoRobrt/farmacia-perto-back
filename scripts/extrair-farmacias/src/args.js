import { parseArgs } from 'node:util';

const AJUDA = `Uso: npm run extrair -- [opções]

  --uf PB                  Filtra por estado (sigla).
  --municipio "Campina Grande"  Filtra por município (exige --uf).
  --arquivo caminho.xlsx   Usa uma planilha já baixada em vez de baixar.
  --saida pasta            Pasta de saída (padrão: saida).
  --sem-geocodificar       Não geocodifica pelo OpenStreetMap quem ficou sem coordenada no CNES.
  --ajuda                  Mostra esta ajuda.`;

export function lerArgumentos(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      uf: { type: 'string' },
      municipio: { type: 'string' },
      arquivo: { type: 'string' },
      saida: { type: 'string', default: 'saida' },
      'sem-geocodificar': { type: 'boolean', default: false },
      ajuda: { type: 'boolean', default: false },
    },
  });

  if (values.ajuda) {
    console.log(AJUDA);
    process.exit(0);
  }
  if (values.municipio && !values.uf) {
    throw new Error('--municipio exige --uf.');
  }

  return {
    uf: values.uf?.toUpperCase(),
    municipio: values.municipio,
    arquivo: values.arquivo,
    saida: values.saida,
    geocodificar: !values['sem-geocodificar'],
  };
}
