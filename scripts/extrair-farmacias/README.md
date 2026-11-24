# extrair-farmacias

Gera a base de farmácias do Farmácia Perto a partir de fontes oficiais, já no formato do contrato da API (`Estado`, `Municipio`, `Farmacia`).

## Fontes

| Dado | Fonte |
|---|---|
| Farmácias participantes (CNPJ, nome, endereço, bairro, município) | Planilha "Farmácias participantes do PFPB", Ministério da Saúde (gov.br) |
| Coordenadas | API de dados abertos do CNES (`apidadosabertos.saude.gov.br`), cruzada pelo CNPJ |
| Coordenadas de quem não está no CNES | Geocodificação do endereço no OpenStreetMap (Nominatim), só com resultado de rua ou mais preciso no município certo |
| Nomes e códigos oficiais de estados e municípios | API de localidades do IBGE |

## Como rodar

Requer Node 22+.

```bash
npm install
npm run extrair -- --uf PB --municipio "Campina Grande"   # piloto
npm run extrair -- --uf PB                                 # estado inteiro
npm run extrair                                            # Brasil inteiro (demora: 1 consulta ao CNES por município)
npm run extrair -- --arquivo planilha.xlsx --uf PB         # usando uma planilha já baixada
npm run extrair -- --uf PB --sem-geocodificar              # só CNES, sem OpenStreetMap
```

## Saída (`saida/`)

| Arquivo | Conteúdo |
|---|---|
| `estados.json` | `Estado[]` com ao menos uma farmácia |
| `municipios.json` | `Municipio[]` (`id` no padrão `pb-campina-grande`) |
| `farmacias.json` | `Farmacia[]` com coordenada válida (`id` = CNPJ) |
| `sem-coordenadas.csv` | Farmácias que ficaram de fora e o motivo |
| `geocodificadas.csv` | Farmácias localizadas pelo OpenStreetMap, com a precisão, para revisão |
| `metadados.json` | Fontes, data da extração, totais, % de cobertura e quantas farmácias ficaram sem consulta por falha do CNES ou do OpenStreetMap (`falhas`) |
| `sincronizacao.json` | `ufs` cobertas pela extração (só siglas de duas letras) e `credenciadas`, os CNPJs da planilha inteira (mesmo com filtro e mesmo sem coordenada). A importação remove do banco as farmácias dessas UFs que não estão na lista |

## Limitações

- Nem toda farmácia credenciada está no CNES, e algumas têm coordenada zerada ou errada. Essas são geocodificadas pelo endereço; a precisão costuma ser de rua (sem o número), então o marcador pode ficar a algumas centenas de metros da porta. As que nem assim são localizadas vão para `sem-coordenadas.csv`.
- O Nominatim permite no máximo 1 requisição por segundo e não aceita uso em massa. Para extrações grandes, use `--sem-geocodificar`.
- Se o CNES falhar em um município ou o OpenStreetMap em uma farmácia, a extração segue e avisa no fim. Depois de 3 falhas seguidas, a fonte não é mais consultada naquela execução. As farmácias afetadas vão para `sem-coordenadas.csv` com o motivo; as que já estão no banco mantêm os dados na importação. Rode a extração de novo para completá-las. Se as falhas deixarem a extração sem nenhuma coordenada, nada é gravado. Falha na planilha ou no IBGE interrompe a extração.
- A saída é carregada no banco com `npm run db:importar -- scripts/extrair-farmacias/saida`, na raiz do back.
- Se o Ministério mudar o nome das colunas da planilha, o script para e mostra o cabeçalho lido; ajuste `COLUNAS` em `src/fontes/pfpb.js`.
- Estar na lista não garante estoque do medicamento.

## Testes

```bash
npm test
```
