# Farmácia Perto - API

API HTTP do Farmácia Perto, app que localiza farmácias credenciadas ao Programa Farmácia Popular. Os dados ficam em PostgreSQL; o banco começa vazio (ainda não há importação da fonte oficial).

## Stack

- Node.js + TypeScript (strict), pacote CommonJS com `module` `nodenext`.
- Express 5 e `cors`.
- Configuração por `.env`, lido com `process.loadEnvFile()` nativo do Node.
- `tsx watch` em desenvolvimento; `tsc` gera `dist/` para produção.
- Testes com Vitest e `supertest`.
- PostgreSQL com o driver `pg`, SQL escrito à mão, sem ORM.
- Os dados mockados de `src/data/` são usados só pelos testes.

## Como rodar

Requisitos: Node.js 22.12 ou superior, nas linhas 22, 24 ou 26+ (exigência do Vitest; o servidor em si precisa de 20.12+ por causa do `process.loadEnvFile`), e PostgreSQL (veja [Banco de dados](#banco-de-dados)).

Na pasta `farmacia-perto-back/`:

```bash
npm install
cp .env.example .env    # no PowerShell: Copy-Item .env.example .env
npm run db:migrate
npm run dev
```

A API sobe em `http://localhost:3000`. O `.env` precisa ter `DATABASE_URL`; as demais variáveis têm os padrões abaixo. Se não conseguir conectar ao banco, a API não sobe.

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com `tsx watch`, recarregando a cada alteração em `src/` |
| `npm run typecheck` | Verifica os tipos de `src/` e `tests/` sem gerar arquivos |
| `npm run build` | Compila `src/` para `dist/` |
| `npm start` | Executa `dist/server.js` (rode `npm run build` antes) |
| `npm test` | Roda os testes com Vitest |
| `npm run db:migrate` | Cria as tabelas e os índices no banco de `DATABASE_URL` |

### Variáveis de ambiente

| Variável | Padrão | Uso |
|---|---|---|
| `DATABASE_URL` | nenhum (obrigatória) | URL de conexão do PostgreSQL, por exemplo `postgres://postgres:senha@localhost:5432/farmacia_perto`. |
| `DATABASE_URL_TEST` | nenhum | Banco dos testes de integração. Esses testes apagam os dados dele. |
| `PORT` | `3000` | Porta HTTP. Precisa ser um inteiro positivo; valor inválido impede a API de subir. |
| `CORS_ORIGIN` | `*` | Origens liberadas no CORS. Aceita `*`, uma origem ou uma lista separada por vírgula. |

O CORS só afeta o Expo web (`http://localhost:8081`); o app Android não envia `Origin`.

## Banco de dados

1. Instale o PostgreSQL para Windows pelo instalador de https://www.postgresql.org/download/windows/. Anote a senha do usuário `postgres` e mantenha a porta padrão `5432`. Para usar `createdb` e `psql` no terminal, adicione a pasta `bin` da instalação (por exemplo `C:\Program Files\PostgreSQL\<versão>\bin`) ao `PATH`.
2. Crie os bancos da aplicação e dos testes:

   ```bash
   createdb -U postgres farmacia_perto
   createdb -U postgres farmacia_perto_test
   ```

   Ou, dentro do `psql -U postgres`:

   ```sql
   CREATE DATABASE farmacia_perto;
   CREATE DATABASE farmacia_perto_test;
   ```

3. No `.env`, ajuste usuário e senha em `DATABASE_URL` (e em `DATABASE_URL_TEST`, se for rodar os testes de integração).
4. Crie as tabelas com `npm run db:migrate`. O comando pode ser repetido sem efeito sobre o que já existe.

O banco começa vazio: até haver dados, `GET /estados` responde `[]` e as demais rotas respondem 404 (UF ou município não encontrado).

Os testes de integração com o PostgreSQL só rodam quando `DATABASE_URL_TEST` está definida, e **apagam os dados desse banco**. Nunca aponte essa variável para o banco da aplicação. Sem ela, `npm test` roda só os testes que usam os dados mockados.

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

Lista as unidades federativas cadastradas, em ordem de nome. Com o banco vazio, devolve `[]`.

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

Lista os municípios da UF. A sigla aceita minúsculas (`pb` ou `PB`). Ordenados por nome; UF existente sem municípios cadastrados devolve `[]`.

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

Lista as farmácias do município, em ordem de nome. Município existente sem farmácias cadastradas devolve `[]`.

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
│   ├── server.ts    # lê a configuração, conecta ao PostgreSQL, injeta os repositórios e sobe o servidor
│   ├── data/        # dados mockados (usados só pelos testes)
│   ├── db/          # pool, schema e script de migração
│   ├── modules/     # estados, municipios, farmacias
│   └── shared/      # tipos, configuração, erros e middlewares
└── tests/
```

Cada módulo é dividido em camadas, criadas por funções fábrica:

- **routes:** mapeiam o caminho para o handler.
- **controller:** lê os parâmetros, chama o service e responde.
- **service:** valida os parâmetros (400) e a existência do recurso (404). Um módulo usa outro pelo service dele (farmacias → municipios → estados).
- **repository:** interface de acesso aos dados, com duas implementações: `repository.pg` (PostgreSQL, usada por `server.ts`) e `repository.mock` (a única que lê `src/data/`, usada pelos testes).

## Apontando o app para a API

O app lê a URL da API da variável `EXPO_PUBLIC_API_URL`, no `.env` de `farmacia-perto-front/`. A API escuta em todas as interfaces de rede, então:

| Onde o app roda | `EXPO_PUBLIC_API_URL` |
|---|---|
| Celular físico na mesma rede Wi-Fi | `http://<IP do PC na rede local>:3000`, por exemplo `http://192.168.0.10:3000` (o IP aparece em `ipconfig`) |
| Emulador Android | `http://10.0.2.2:3000` |

Reinicie o Expo depois de alterar o `.env` do front.
