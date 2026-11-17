# Farmácia Perto - API

API HTTP do Farmácia Perto, app que localiza farmácias credenciadas ao Programa Farmácia Popular. Nesta etapa serve dados mockados: estados e municípios reais, farmácias fictícias.

## Stack

- Node.js + TypeScript (strict), pacote CommonJS com `module` `nodenext`.
- Express 5 e `cors`.
- Configuração por `.env`, lido com `process.loadEnvFile()` nativo do Node.
- `tsx watch` em desenvolvimento; `tsc` gera `dist/` para produção.
- Testes com Vitest e `supertest`.
- Sem banco de dados: os dados ficam em `src/data/`.

## Como rodar

Requisito: Node.js 22.12 ou superior, nas linhas 22, 24 ou 26+ (exigência do Vitest; o servidor em si precisa de 20.12+ por causa do `process.loadEnvFile`).

Na pasta `farmacia-perto-back/`:

```bash
npm install
cp .env.example .env    # no PowerShell: Copy-Item .env.example .env
npm run dev
```

A API sobe em `http://localhost:3000`. O `.env` é opcional: sem ele valem os padrões abaixo.

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com `tsx watch`, recarregando a cada alteração em `src/` |
| `npm run typecheck` | Verifica os tipos de `src/` e `tests/` sem gerar arquivos |
| `npm run build` | Compila `src/` para `dist/` |
| `npm start` | Executa `dist/server.js` (rode `npm run build` antes) |
| `npm test` | Roda os testes com Vitest |

### Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3000` | Porta HTTP. Precisa ser um inteiro positivo; valor inválido impede a API de subir. |
| `CORS_ORIGIN` | `*` | Origens liberadas no CORS. Aceita `*`, uma origem ou uma lista separada por vírgula. |

O CORS só afeta o Expo web (`http://localhost:8081`); o app Android não envia `Origin`.

## Endpoints

Todas as respostas são JSON. Os campos seguem os tipos `Estado`, `Municipio` e `Farmacia` de `src/shared/types.ts`. Nos exemplos de lista abaixo, `...` indica itens omitidos: a resposta real traz a lista completa.

### `GET /health`

```http
GET /health
```

```json
{ "status": "ok" }
```

### `GET /estados`

Lista as 27 unidades federativas.

```http
GET /estados
```

```json
[
  { "sigla": "AC", "nome": "Acre" },
  { "sigla": "AL", "nome": "Alagoas" },
  ...
]
```

### `GET /estados/:uf/municipios`

Lista os municípios da UF. A sigla aceita minúsculas (`pb` ou `PB`). UF existente sem municípios no mock devolve `[]`.

```http
GET /estados/PB/municipios
```

```json
[
  { "id": "pb-campina-grande", "nome": "Campina Grande", "uf": "PB" },
  { "id": "pb-joao-pessoa", "nome": "João Pessoa", "uf": "PB" },
  ...
]
```

| Status | Quando | Exemplo | Resposta |
|---|---|---|---|
| 400 | UF sem 2 letras | `GET /estados/P1/municipios` | `{ "mensagem": "UF inválida. Informe a sigla com 2 letras, por exemplo PB." }` |
| 404 | UF inexistente | `GET /estados/XX/municipios` | `{ "mensagem": "UF não encontrada." }` |

### `GET /municipios/:id/farmacias`

Lista as farmácias do município. O mock tem farmácias apenas em `pb-campina-grande` e `pb-joao-pessoa`; os demais municípios devolvem `[]`.

```http
GET /municipios/pb-campina-grande/farmacias
```

```json
[
  {
    "id": "cg-01",
    "nome": "Farmácia Saúde & Vida Popular",
    "endereco": "Rua Venâncio Neiva, 120",
    "bairro": "Centro",
    "municipioId": "pb-campina-grande",
    "latitude": -7.2215,
    "longitude": -35.883
  },
  ...
]
```

| Status | Quando | Exemplo | Resposta |
|---|---|---|---|
| 400 | Id vazio ou com mais de 100 caracteres | `GET /municipios/%20/farmacias` | `{ "mensagem": "Id de município inválido." }` |
| 404 | Município inexistente | `GET /municipios/nao-existe/farmacias` | `{ "mensagem": "Município não encontrado." }` |

### Erros comuns a todas as rotas

| Status | Quando | Resposta |
|---|---|---|
| 404 | Rota ou método não registrado, por exemplo `GET /farmacias` | `{ "mensagem": "Rota não encontrada." }` |
| 500 | Falha inesperada (o detalhe vai só para o log do servidor) | `{ "mensagem": "Erro interno do servidor." }` |

## Estrutura

```
farmacia-perto-back/
├── src/
│   ├── app.ts       # criarApp: monta middlewares, módulos e tratamento de erros
│   ├── server.ts    # lê a configuração, injeta os repositórios mock e sobe o servidor
│   ├── data/        # dados mockados
│   ├── modules/     # estados, municipios, farmacias
│   └── shared/      # tipos, configuração, erros e middlewares
└── tests/
```

Cada módulo é dividido em camadas, criadas por funções fábrica:

- **routes:** mapeiam o caminho para o handler.
- **controller:** lê os parâmetros, chama o service e responde.
- **service:** valida os parâmetros (400) e a existência do recurso (404). Um módulo usa outro pelo service dele (farmacias → municipios → estados).
- **repository:** interface de acesso aos dados; a implementação `repository.mock` é a única que lê `src/data/`. Trocar pela fonte real exige só outra implementação, passada em `server.ts`.

## Apontando o app para a API

O app lê a URL da API da variável `EXPO_PUBLIC_API_URL`, no `.env` de `farmacia-perto-front/`. A API escuta em todas as interfaces de rede, então:

| Onde o app roda | `EXPO_PUBLIC_API_URL` |
|---|---|
| Celular físico na mesma rede Wi-Fi | `http://<IP do PC na rede local>:3000`, por exemplo `http://192.168.0.10:3000` (o IP aparece em `ipconfig`) |
| Emulador Android | `http://10.0.2.2:3000` |

Reinicie o Expo depois de alterar o `.env` do front.
