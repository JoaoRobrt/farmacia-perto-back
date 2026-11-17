import { buscarJson } from '../http.js';
import { normalizar } from '../texto.js';

const API_IBGE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

/** Estados oficiais: [{ sigla, nome }]. */
export async function listarEstadosIbge() {
  const estados = await buscarJson(`${API_IBGE}/estados?orderBy=nome`);
  return estados.map((e) => ({ sigla: e.sigla, nome: e.nome }));
}

/** Municípios de uma UF: [{ codigo (7 dígitos), nome }]. */
export async function listarMunicipiosIbge(uf) {
  const municipios = await buscarJson(`${API_IBGE}/estados/${uf}/municipios?orderBy=nome`);
  return municipios.map((m) => ({ codigo: String(m.id), nome: m.nome }));
}

/** Índice para achar o município do IBGE pelo código ou pelo nome. */
export function indexarMunicipios(municipios) {
  const porCodigo = new Map(municipios.map((m) => [m.codigo, m]));
  const porNome = new Map(municipios.map((m) => [normalizar(m.nome), m]));
  return {
    achar({ codigoMunicipio, municipio }) {
      if (codigoMunicipio) {
        // aceita 7 dígitos (IBGE) ou 6 (sem dígito verificador, usado no CNES)
        const m = codigoMunicipio.length === 7
          ? porCodigo.get(codigoMunicipio)
          : municipios.find((x) => x.codigo.startsWith(codigoMunicipio));
        if (m) return m;
      }
      return porNome.get(normalizar(municipio));
    },
  };
}
