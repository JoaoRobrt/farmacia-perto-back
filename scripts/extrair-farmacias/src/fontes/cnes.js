import { buscarJson, esperar } from '../http.js';
import { normalizarCnpj } from '../texto.js';

const API_CNES = 'https://apidadosabertos.saude.gov.br/cnes/estabelecimentos';
const TIPO_FARMACIA = 43;
const POR_PAGINA = 20; // máximo aceito pela API
const PAUSA_MS = 200; // educação com a API pública

/**
 * Farmácias do CNES em um município, indexadas por CNPJ.
 * A API usa `offset` como número da página (0, 1, 2...).
 * @param {string} codigoIbge 7 dígitos; o CNES usa os 6 primeiros.
 */
export async function coordenadasCnesPorCnpj(codigoIbge) {
  const municipio = codigoIbge.slice(0, 6);
  const porCnpj = new Map();

  for (let pagina = 0; ; pagina++) {
    const url = `${API_CNES}?codigo_tipo_unidade=${TIPO_FARMACIA}&codigo_municipio=${municipio}&limit=${POR_PAGINA}&offset=${pagina}`;
    const { estabelecimentos = [] } = await buscarJson(url);

    for (const e of estabelecimentos) {
      const cnpj = normalizarCnpj(e.numero_cnpj);
      if (cnpj.length !== 14) continue;
      porCnpj.set(cnpj, {
        latitude: e.latitude_estabelecimento_decimo_grau,
        longitude: e.longitude_estabelecimento_decimo_grau,
        codigoCnes: e.codigo_cnes,
      });
    }
    if (estabelecimentos.length < POR_PAGINA) break;
    await esperar(PAUSA_MS);
  }
  return porCnpj;
}
