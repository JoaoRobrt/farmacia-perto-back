import { buscarJson, esperar } from '../http.js';
import { normalizar } from '../texto.js';

const API_NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// A política de uso do Nominatim exige no máximo 1 requisição por segundo e um User-Agent que identifique a aplicação.
const PAUSA_MS = 1100;
const USER_AGENT = 'farmacia-perto-extrator/1.0';

// Resultados que só localizam a área (cidade, bairro...) cairiam longe da farmácia.
const NIVEIS_DE_AREA = new Set([
  'country', 'state', 'region', 'county', 'municipality', 'city', 'town', 'village', 'hamlet',
  'city_district', 'district', 'borough', 'suburb', 'quarter', 'neighbourhood', 'postcode',
]);

/** Aceita o resultado só se for de rua ou mais preciso e estiver no município esperado. */
export function resultadoAceito(resultado, municipio) {
  if (!resultado || NIVEIS_DE_AREA.has(resultado.addresstype)) return false;
  const a = resultado.address ?? {};
  const cidade = a.city ?? a.town ?? a.municipality ?? a.village;
  return normalizar(cidade) === normalizar(municipio);
}

/**
 * Geocodifica o endereço de uma farmácia pelo OpenStreetMap.
 * Devolve { latitude, longitude, precisao } ou undefined quando não acha com segurança.
 */
export async function geocodificarNominatim({ endereco, municipio, uf }) {
  const q = `${endereco}, ${municipio} - ${uf}, Brasil`;
  const url = `${API_NOMINATIM}?format=jsonv2&addressdetails=1&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
  try {
    const [resultado] = await buscarJson(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resultadoAceito(resultado, municipio)) return undefined;
    return {
      latitude: Number(resultado.lat),
      longitude: Number(resultado.lon),
      precisao: resultado.addresstype,
    };
  } finally {
    await esperar(PAUSA_MS);
  }
}
