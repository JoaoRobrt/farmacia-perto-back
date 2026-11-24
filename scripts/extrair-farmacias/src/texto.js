/** Remove acentos, espaços extras e deixa em maiúsculas, para comparar nomes. */
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Mantém só os dígitos (CNPJ, códigos). */
export function somenteDigitos(texto) {
  return String(texto ?? '').replace(/\D/g, '');
}

/** CNPJ com 14 posições, em maiúsculas e sem pontuação; fora do formato, só os dígitos. */
export function normalizarCnpj(texto) {
  const cnpj = normalizar(texto).replace(/[^A-Z0-9]/g, '');
  return /^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) ? cnpj : somenteDigitos(texto);
}

/** "Campina Grande" + "PB" -> "pb-campina-grande" (padrão de id do app). */
export function idMunicipio(uf, nome) {
  const slug = normalizar(nome)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${uf.toLowerCase()}-${slug}`;
}
