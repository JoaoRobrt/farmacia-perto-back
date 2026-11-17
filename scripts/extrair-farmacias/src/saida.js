import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const json = (dados) => `${JSON.stringify(dados, null, 2)}\n`;

function csv(linhas) {
  if (!linhas.length) return '';
  const colunas = Object.keys(linhas[0]);
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => escapar(l[c])).join(';'))].join('\n') + '\n';
}

/** Grava os arquivos no formato do contrato da API e os relatórios. */
export async function gravarSaida(pasta, { estados, municipios, farmacias, semCoordenada, geocodificadas, metadados }) {
  await mkdir(pasta, { recursive: true });
  await Promise.all([
    writeFile(join(pasta, 'estados.json'), json(estados)),
    writeFile(join(pasta, 'municipios.json'), json(municipios)),
    writeFile(join(pasta, 'farmacias.json'), json(farmacias)),
    writeFile(join(pasta, 'sem-coordenadas.csv'), csv(semCoordenada)),
    writeFile(join(pasta, 'geocodificadas.csv'), csv(geocodificadas)),
    writeFile(join(pasta, 'metadados.json'), json(metadados)),
  ]);
}
