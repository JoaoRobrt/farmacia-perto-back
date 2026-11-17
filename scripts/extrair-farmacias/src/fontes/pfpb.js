import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import { buscar } from '../http.js';
import { normalizar, somenteDigitos } from '../texto.js';

/** Planilha oficial "Farmácias participantes do PFPB" (Ministério da Saúde). */
export const URL_PLANILHA_PFPB =
  'https://www.gov.br/saude/pt-br/composicao/sectics/farmacia-popular/publicacoes/farmacias-participante-do-programa-farmacia-popular/@@download/file';

/** Nomes aceitos para cada coluna (comparados sem acento, em maiúsculas). */
const COLUNAS = {
  uf: ['UF'],
  municipio: ['MUNICIPIO', 'NOME MUNICIPIO', 'CIDADE'],
  codigoMunicipio: ['COD. MUNICIPIO', 'COD MUNICIPIO', 'CODIGO MUNICIPIO', 'CODIGO IBGE', 'COD. IBGE', 'IBGE'],
  cnpj: ['CNPJ'],
  farmacia: ['FARMACIA', 'NOME FANTASIA', 'ESTABELECIMENTO', 'NOME'],
  razaoSocial: ['RAZAO SOCIAL'],
  endereco: ['ENDERECO', 'LOGRADOURO'],
  bairro: ['BAIRRO'],
};
const OBRIGATORIAS = ['uf', 'municipio', 'cnpj', 'endereco'];

export async function obterPlanilha(arquivo) {
  if (arquivo) return readFile(arquivo);
  const resposta = await buscar(URL_PLANILHA_PFPB, { timeoutMs: 120000 });
  return Buffer.from(await resposta.arrayBuffer());
}

function textoCelula(celula) {
  const valor = celula?.value;
  if (valor == null) return '';
  if (typeof valor === 'object') {
    if ('richText' in valor) return valor.richText.map((t) => t.text).join('');
    if ('text' in valor) return String(valor.text);
    if ('result' in valor) return String(valor.result ?? '');
  }
  return String(valor).trim();
}

/** Acha a linha de cabeçalho (a primeira que tem "CNPJ") e mapeia as colunas. */
function mapearCabecalho(planilha) {
  for (let n = 1; n <= Math.min(planilha.rowCount, 30); n++) {
    const linha = planilha.getRow(n);
    const titulos = [];
    linha.eachCell({ includeEmpty: true }, (celula, col) => {
      titulos[col] = normalizar(textoCelula(celula));
    });
    if (!titulos.includes('CNPJ')) continue;

    const mapa = {};
    for (const [campo, nomes] of Object.entries(COLUNAS)) {
      const col = titulos.findIndex((t) => t && nomes.includes(t));
      if (col > 0) mapa[campo] = col;
    }
    const faltando = OBRIGATORIAS.filter((c) => !mapa[c]);
    if (faltando.length) {
      throw new Error(
        `Colunas obrigatórias não encontradas: ${faltando.join(', ')}. ` +
          `Cabeçalho lido: ${titulos.filter(Boolean).join(' | ')}. Ajuste COLUNAS em src/fontes/pfpb.js.`,
      );
    }
    return { linhaCabecalho: n, mapa };
  }
  throw new Error('Cabeçalho com a coluna CNPJ não encontrado nas 30 primeiras linhas da planilha.');
}

/** Lê o .xlsx e devolve as farmácias como objetos simples. */
export async function lerFarmaciasPfpb(buffer) {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(buffer);
  const planilha = livro.worksheets[0];
  const { linhaCabecalho, mapa } = mapearCabecalho(planilha);

  const farmacias = [];
  for (let n = linhaCabecalho + 1; n <= planilha.rowCount; n++) {
    const linha = planilha.getRow(n);
    const ler = (campo) => (mapa[campo] ? textoCelula(linha.getCell(mapa[campo])) : '');
    const cnpj = somenteDigitos(ler('cnpj')).padStart(14, '0');
    if (cnpj === '0'.repeat(14)) continue;

    farmacias.push({
      cnpj,
      uf: normalizar(ler('uf')),
      municipio: ler('municipio'),
      codigoMunicipio: somenteDigitos(ler('codigoMunicipio')),
      nome: ler('farmacia') || ler('razaoSocial'),
      endereco: ler('endereco'),
      bairro: ler('bairro'),
    });
  }
  return farmacias;
}
