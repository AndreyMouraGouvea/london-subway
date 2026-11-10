# London Digital Twin

Digital twin operacional do sistema metroferroviário de Londres, construído com dados abertos da **Transport for London**. O mapa é a superfície principal; o frontend consome apenas uma API própria normalizada e nunca chama a TfL diretamente.

> Projeto independente. Não é afiliado, endossado ou patrocinado pela Transport for London.

## Estado atual — Fase 6

- Monorepo npm workspaces.
- Frontend React 18 + Vite + TypeScript + Tailwind + MapLibre GL JS.
- Layout CCO, dashboard, alertas, análise, exploração de dados e página de fontes.
- Escala tipográfica global em `18px` (`html`), com tamanhos arbitrários convertidos para `rem` para acompanharem o aumento.
- Fase 6: autenticação Supabase (email/palavra-passe), perfil, favoritos de linhas/estações, subscrições de alertas por linha, notificações do browser e administração read-only.
- Relatório operacional imprimível/PDF em `/report`, com resumo, estado por linha, alertas, histórico, saúde e jobs.
- Camada GIS opcional com os 33 boroughs de Londres (ONS, OGL v3.0). PTAL não está disponível como camada validada.
- `packages/shared`: contratos, schemas Zod, modos, cores oficiais TfL, severidade, datas.
- `packages/api-core`: router Hono, health check, cache, logging, cliente TfL com validação Zod, timeouts/retry e redação de `app_key`.
- Ingestão real: `sync-reference`, `sync-status`, `sync-disruptions`, `sync-cleanup`, `ingest:footfall`, `ingest:annual`, `ingest:numbat`, `ingest:crowding` e `ingest:rods`.
- Dados sincronizados no Supabase local: 20 linhas, 509 estações canónicas, 705 relações linha–estação, 20 geometrias e alertas ativos.
- Endpoints: `/network`, `/network/status`, `/lines`, `/lines/:id`, `/lines/:id/status`, `/lines/:id/disruptions`, `/lines/:id/route`, `/lines/:id/stations`, `/stations`, `/stations/:id`, `/stations/:id/arrivals`, `/stations/:id/disruptions`, `/disruptions`, `/dashboard/summary`, `/dashboard/history`, `/data-health`, `/jobs`, `/analytics/network`, `/analytics/scenarios`, `/analytics/footfall/summary`, `/analytics/footfall/stations/:id`, `/analytics/annual/summary`, `/analytics/boardings`, `/analytics/crowding/stations/:id`, `/analytics/rods/stations/:id`, `/sources`.
- Frontend mostra resumo real no CCO, KPIs no dashboard, alertas ativos, tabelas de linhas/estações e exportação CSV/GeoJSON.
- Mapa CCO com 20 geometrias, 509 estações, cores oficiais/status, seleção de linha/estação, hover popup, filtros, busca e comparação de até 3 linhas.
- Painéis de linha e estação com status, disrupções, facilities, entradas, previsões e timestamps.
- Deep links: `/?line=bakerloo` e `/?station=940GZZLUOXC`.
- Fase 4: Supabase Realtime em `line_status_snapshots`, `disruptions` e `network_status_snapshots`, com invalidação de queries e polling de 60 s como fallback.
- Dashboard com série temporal horária (6/24/72 h), top linhas por tempo em disrupção, jobs recentes e retenção.
- Alertas com filtros reais por banda, linha, âmbito e pesquisa.
- Fase 5.1: grafo estação–segmento derivado de `line_stations` + hubs Naptan, indicadores de acessibilidade observada, resiliência topológica e simulador de cenários (`scenario`).
- Footfall histórico diário real: 286 190 registos, 433 estações, 2025-01-01 → 2026-10-31, dataset `tfl-station-footfall-2025-2026`.
- Fase 5.2: annual station counts 2025 (428 estações, 2,92 mil milhões de entradas+saídas), NUMBAT 2016–2025 (18 linhas), link flows e train loading típicos de 2017 (270 estações; 22 680 + 57 453 perfis).
- Fase 5.3: RODS 2017 com boarders/alighters por estação, linha, direção e intervalo de 15 min (121 716 perfis, 267 estações).
- Página `/analytics` com grafo, articulações, impacto por linha, cenários, footfall, annual counts, boardings por linha, crowding típico e RODS.
- Agregados horários particionados por mês, rollup no fim de cada `sync-status` e retenção auditável na base de dados.
- Edge Function `api` empacotada por esbuild, com `/health`, CORS e rotas de sincronização protegidas por segredo.
- Supabase: migrações com PostGIS, tabelas, índices, views, RLS, Realtime e Storage.
- Configs de deploy Cloudflare Pages e Netlify, CI e documentação.

Nenhum dado operacional fictício é exibido. Quando a fonte falha, a API devolve cache/stale ou indisponibilidade com timestamp.

Validações executadas: migrações + seed aplicados; RLS bloqueando `api_cache` e RPCs internas; trigger PostGIS; view de status; sync real da TfL; 509 estações canónicas; footfall, annual counts, NUMBAT, crowding 2017 e RODS 2017 ingeridos; endpoints de rede/linha/estação/arrivals/dashboard/histórico/jobs/análise; CORS 403 para origem não permitida; `npm run lint`, `typecheck`, `test` (59), `build` e `format:check`.

## Requisitos

- Node.js 22+ (recomendado 24).
- npm 10+.
- Docker Desktop (para o Supabase local).
- Conta Supabase (para deploy).
- `app_key` da TfL (recomendado; necessário para o plano de 500 req/min e feeds registados).

## Instalação

```bash
npm install
cp .env.example .env.local
```

Preencha `.env.local` com os valores locais. Nunca coloque `TFL_APP_KEY` nem `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_*`.

O Vite lê o `.env.local` da raiz (`envDir` em `apps/web/vite.config.ts`), por isso as variáveis `VITE_*` ficam no mesmo ficheiro que as credenciais locais. Apenas o prefixo `VITE_` é exposto ao browser.

## Desenvolvimento

```bash
# Frontend + API local
npm run dev

# Apenas frontend (http://localhost:5173)
npm run dev:web

# Apenas API local (http://localhost:8787)
npm run dev:api
```

Health check:

```bash
curl http://localhost:8787/health
```

Resposta esperada (resumida):

```json
{
  "data": {
    "status": "ok",
    "service": "london-digital-twin-api",
    "version": "0.1.0",
    "checks": { "database": "ok", "cache": "ok", "tfl": "not_checked" }
  },
  "meta": { "source": "derived", "dataSourceStatus": "live", "isStale": false }
}
```

### Sincronização manual

Com o API local a correr e `.env.local` preenchido:

```bash
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/reference
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/status
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/disruptions
curl -X POST -H "x-cron-secret: local-dev-cron-secret" http://localhost:8787/sync/cleanup
```

Na Edge Function, troca `http://localhost:8787` por
`http://127.0.0.1:54321/functions/v1/api`.

`sync-reference` faz ~43 chamadas à TfL. Sem `app_key`, o cliente usa concorrência conservadora
para respeitar o limite anónimo. `sync-status` e `sync-disruptions` correm em menos de 1 s.

### Ingestão de footfall histórico

```bash
npm run ingest:footfall
# smoke test sem escrever na base de dados
npm run footfall:dry -w @ldt/ingest
# opções: --from=2025-01-01 --to=2026-10-31 --limit=1000 --file=... --refresh
```

O pipeline descarrega `StationFootfall_2025_2026.csv` (TfL), resolve os nomes das estações
para IDs canónicos, agrega duplicados por estação/dia e faz upsert em
`station_traffic_snapshots`. Nomes sem correspondência são reportados e nunca inventados.

### Outros datasets históricos

```bash
npm run ingest:annual    # AC2025 annualised entry/exit por estação
npm run ingest:numbat    # boardings anuais por linha, 2016–2025
npm run ingest:crowding  # link flows + train loading típicos de 2017
npm run ingest:rods      # RODS 2017 boarders/alighters por estação e intervalo
npm run ingest:all       # footfall + annual + NUMBAT + crowding + RODS
```

- Annual counts: `granularity = annual`, `travel_date = 2025-12-31`.
- NUMBAT: tabela `line_annual_boardings`; `HAM` (H&C + Circle) fica sem `line_id` por ser combinado.
- Crowding 2017: `station_crowding_profiles` (`link_flow` agregado por estação/intervalo;
  `train_loading` por ligação linha–estação). São perfis típicos, não tempo real.
- RODS 2017: `station_crowding_profiles` (`entry_exit`) com boarders e alighters
  ponderados por estação/linha/direção/intervalo; `profile_name` distingue o metric.

### Endpoints principais

| Endpoint | Conteúdo |
|---|---|
| `GET /network` | 20 linhas, 509 estações, 20 geometrias e resumo |
| `GET /network/status` | Resumo + status atual por linha |
| `GET /lines` | Catálogo com status, estações e disrupções |
| `GET /lines/:id/route?direction=outbound` | Ramos, ordem de estações e MultiLineString |
| `GET /stations` | Estações canónicas com linha, zona e facilities |
| `GET /stations/:id` | Detalhe + entradas + facilities + disrupções |
| `GET /stations/:id/arrivals?count=20` | Previsões live/cache com TTL 45 s |
| `GET /disruptions` | Alertas ativos normalizados; aceita `lineId`, `band`, `scope`, `category`, `stationId`, `q` |
| `GET /dashboard/summary` | KPIs, top linhas e saúde dos dados |
| `GET /dashboard/history?hours=24` | Série horária, top linhas por disrupção e cobertura (1–168 h) |
| `GET /data-health` | Fontes, jobs recentes e política de retenção |
| `GET /jobs?limit=10` | Jobs de sincronização (sem mensagens de erro internas) |
| `GET /analytics/network` | Grafo, acessibilidade, articulações e impacto por linha |
| `GET /analytics/scenarios?type=station_closure&id=...` | Cenário topológico de fecho de estação ou falha de linha |
| `GET /analytics/footfall/summary?days=30` | Footfall histórico agregado por dia e top estações |
| `GET /analytics/footfall/stations/:id?days=90` | Série histórica diária de uma estação |
| `GET /analytics/annual/summary?limit=12` | Entradas/saídas anuais por estação (2025) |
| `GET /analytics/boardings` | Boardings anuais por linha (NUMBAT 2016–2025) |
| `GET /analytics/crowding/stations/:id` | Perfil típico de 2017 por intervalos de 15 min |
| `GET /analytics/rods/stations/:id?metric=boarders` | RODS 2017 boarders/alighters por intervalo |
| `GET /sources` | Estado e última sincronização das fontes |

## Conta, favoritos e administração

- A autenticação usa Supabase Auth com email/palavra-passe. Em local, as confirmações de email estão desativadas (`supabase/config.toml`).
- `/account` permite criar conta, entrar, gerir favoritos e subscrever linhas para alertas.
- Favoritos e subscrições estão em `user_favorites` / `user_alert_subscriptions`, com RLS `auth.uid() = user_id`.
- `profiles` é criado por trigger a partir de `auth.users`; `is_admin` não é editável pela API pública.
- Para promover um administrador local, usar service_role/SQL:
  ```sql
  update public.profiles set is_admin = true where email = 'o-seu-email@exemplo.com';
  ```
- `/admin` é read-only (fontes, jobs e retenção) e só abre para `is_admin = true`.
- As notificações do browser funcionam apenas com a aplicação aberta; não há serviço de push.
- `/report` gera um relatório imprimível; use “Imprimir / Guardar PDF” para PDF.

## Qualidade

```bash
npm run typecheck
npm run lint
npm run test
npm run format:check
npm run build
```

## Supabase local

O CLI está instalado como devDependency; use `npx supabase`.

```bash
npx supabase start
npx supabase db reset
```

Isso aplica:

- `supabase/migrations/20261110000100_initial_schema.sql`
- `supabase/migrations/20261110000200_rls.sql`
- `supabase/migrations/20261110000300_phase2.sql`
- `supabase/migrations/20261110000600_phase4_history.sql`
- `supabase/migrations/20261110000700_phase4_function_grants.sql`
- `supabase/migrations/20261110000800_phase5_footfall.sql`
- `supabase/migrations/20261110000900_phase52_datasets.sql`
- `supabase/migrations/20261110001000_phase53_rods.sql`
- `supabase/migrations/20261110001100_phase6_users.sql`
- `supabase/migrations/20261110001200_phase6_boroughs.sql`
- `supabase/seed/seed.sql`

Para servir a Edge Function localmente:

```bash
npm run supabase:serve
```

Isso executa `npm run edge:build` e depois `supabase functions serve`. A função fica em
`http://localhost:54321/functions/v1/api/health`.

### MapLibre worker

O MapLibre GL JS v6 usa um worker separado. O projeto copia
`node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs` para
`apps/web/public/maplibre-gl-worker.mjs` nos scripts `predev`/`prebuild` e chama
`setWorkerUrl('/maplibre-gl-worker.mjs')`. Sem isso, o mapa falha com
`Worker failed to load` e não desenha tiles nem GeoJSON.

### Realtime, histórico e retenção

- O frontend subscreve `postgres_changes` em `line_status_snapshots`, `disruptions` e
  `network_status_snapshots`. As invalidações são agrupadas (1,2 s) para não refazer
  queries a cada linha gravada.
- O polling de 60 s em `useOperations` continua ativo como fallback; o badge no
  topo mostra `Tempo real` ou `Polling`.
- `sync-status` grava os snapshots e chama `ldt_rollup_status_hourly`, que atualiza
  as tabelas horárias particionadas por mês (`network_status_hourly`,
  `line_status_hourly`).
- `/dashboard/history` lê esses agregados; cada bucket representa o snapshot mais
  recente da hora, para que as contagens somem sempre `lines_total`.
- `sync-cleanup` chama `ldt_apply_retention`: apaga snapshots/cache/jobs antigos e
  faz drop das partições horárias fora da janela. A retenção é configurável por
  parâmetros da função.
- Se o Realtime não estiver configurado, a UI funciona apenas com polling e mostra
  `Polling` em vez de `Tempo real`.

### Edge Function e código compartilhado

A função importa `packages/api-core` e `packages/shared` por caminhos relativos. O script
`scripts/build-edge.mjs` usa esbuild para gerar `supabase/functions/api/index.bundle.js`, que é o
entrypoint configurado em `supabase/config.toml`. O bundle mantém apenas
`npm:@supabase/supabase-js` como external, resolvido pelo runtime Deno.

O harness local `apps/api` continua funcionando independentemente, sem Docker.

## Variáveis de ambiente

### Frontend (público)

| Variável | Descrição |
|---|---|
| `VITE_API_BASE_URL` | Base da API própria. Em dev, `http://localhost:8787`; em produção, a URL da Edge Function. |
| `VITE_SUPABASE_URL` | URL do projeto Supabase. |
| `VITE_SUPABASE_ANON_KEY` | Anon key pública. RLS deve proteger os dados. |
| `VITE_MAP_STYLE_URL` | Estilo MapLibre. Padrão: OpenFreeMap Dark. |

### Backend local / Edge Functions (privado)

| Variável | Descrição |
|---|---|
| `TFL_APP_KEY` | Chave da TfL. Somente no backend. |
| `TFL_API_BASE_URL` | Padrão `https://api.tfl.gov.uk`. |
| `TFL_TIMEOUT_MS` | Timeout por chamada. Padrão 8000. |
| `TFL_MAX_RETRIES` | Retries em 429/5xx. Padrão 2. |
| `ALLOWED_ORIGINS` | Origens CORS separadas por vírgula. |
| `SUPABASE_URL` | Injetado automaticamente nas Edge Functions em produção. |
| `SUPABASE_SERVICE_ROLE_KEY` | Injetado automaticamente; nunca expor no frontend. |
| `LOCAL_SUPABASE_URL` | Alias local para `supabase functions serve` (o CLI ignora `SUPABASE_*`). |
| `LOCAL_SUPABASE_SERVICE_ROLE_KEY` | Alias local do service role para `supabase functions serve`. |
| `CRON_SECRET` | Segredo para jobs internos; alias `LDT_CRON_SECRET` no runtime local. |

## Deploy

Arquitetura de produção:

- **GitHub Pages** serve o frontend estático (`apps/web/dist`) via GitHub Actions.
- **Supabase** (`eu-west-2`) fornece Postgres/PostGIS, Auth, RLS, Realtime e a Edge Function `api`.
- **Supabase Cron** (`pg_cron` + `pg_net`) chama os endpoints de sincronização.

Cloudflare Pages continua suportado como alternativa (ver abaixo).

### 1. Supabase

```bash
npx supabase login
npx supabase projects create london-digital-twin \
  --org-id <ORG_ID> --region eu-west-2 --db-password '<DB_PASSWORD>'
npx supabase link --project-ref <PROJECT_REF> --password '<DB_PASSWORD>'
npx supabase db push --include-seed
npm run supabase:deploy -- --no-verify-jwt
```

O `--include-seed` é obrigatório: as migrações não aplicam modos, linhas, severidades nem fontes de dados.

Secrets da função:

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS=https://<PROJETO>.pages.dev \
  LDT_CRON_SECRET='<SEGREDO_FORTE>'
```

`TFL_APP_KEY` é opcional; sem ela a API usa o limite anónimo da TfL:

```bash
npx supabase secrets set TFL_APP_KEY='<CHAVE>'
```

A função `api` é pública (`verify_jwt = false`) para leitura; os endpoints `/sync/*` exigem o header `x-cron-secret`.

### 2. Dados de produção

```bash
curl -X POST -H "x-cron-secret: <SEGREDO>" \
  https://<PROJECT_REF>.supabase.co/functions/v1/api/sync/reference

SUPABASE_URL=https://<PROJECT_REF>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE> \
npm run ingest:all

curl -X POST -H "x-cron-secret: <SEGREDO>" .../api/sync/status
curl -X POST -H "x-cron-secret: <SEGREDO>" .../api/sync/disruptions
```

A service role fica apenas no ambiente local que corre o ingest; nunca no browser nem no repositório.

### 3. GitHub Pages

O deploy é feito por GitHub Actions (`.github/workflows/deploy-pages.yml`) a cada push em `main`.

1. Em **Settings → Pages → Build and deployment**, escolhe **Source: GitHub Actions**.
2. Faz push em `main` ou corre o workflow **Deploy (GitHub Pages)** manualmente.
3. URL: `https://andreyMouraGouvea.github.io/london-subway/`.

O projeto é publicado num subpath, por isso o build recebe `VITE_BASE_PATH=/london-subway/`. O `vite.config.ts` usa essa variável como `base`, e o router deriva o `basename` de `import.meta.env.BASE_URL`.

Limitações do GitHub Pages face ao Cloudflare Pages:

- Não suporta headers HTTP personalizados; o CSP é aplicado por `<meta http-equiv="Content-Security-Policy">` em `apps/web/index.html`.
- Não tem rewrites: o workflow copia `index.html` para `404.html` para os deep links da SPA.
- Não tem preview deploys por branch.

As variáveis `VITE_*` podem ser definidas como repository variables (`Settings → Secrets and variables → Actions → Variables`); o workflow tem os valores públicos atuais como fallback.

#### Alternativa: Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy apps/web/dist --project-name london-digital-twin
```

Configuração em `wrangler.jsonc`, cabeçalhos em `apps/web/public/_headers` e rewrites em `_redirects`. Com Cloudflare não é preciso `VITE_BASE_PATH` (o site fica na raiz).

### 4. Auth e CORS

No Supabase, em **Authentication → URL Configuration**:

- Site URL: `https://andreyMouraGouvea.github.io/london-subway/`.
- Redirect URLs: `https://andreyMouraGouvea.github.io/**` e `http://localhost:5173`.

`ALLOWED_ORIGINS` compara origens exatas. Para GitHub Pages a origem é `https://andreyMouragouvea.github.io` (o caminho não conta). Previews do Cloudflare mudam de URL a cada deploy.

### 5. Supabase Cron

Depois de publicar a função e definir `LDT_CRON_SECRET`, executa `scripts/setup-cron.sql` com o `project_ref` e o segredo substituídos. O script guarda ambos no Vault e agenda:

| Job | Cron | Endpoint |
|---|---|---|
| `ldt-sync-status` | `*/2 * * * *` | `/api/sync/status` |
| `ldt-sync-disruptions` | `*/5 * * * *` | `/api/sync/disruptions` |
| `ldt-sync-reference` | `15 3 * * *` | `/api/sync/reference` |
| `ldt-sync-cleanup` | `45 3 * * *` | `/api/sync/cleanup` |

### Netlify

O `netlify.toml` mantém-se como alternativa: build `npm run build`, publish `apps/web/dist`, redirect SPA e headers de segurança.

## Segurança

- `TFL_APP_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` nunca entram no bundle.
- O frontend não chama `api.tfl.gov.uk`.
- RLS habilitado em todas as tabelas públicas; escrita apenas com `service_role`.
- Favoritos e subscrições usam RLS `auth.uid() = user_id`; `is_admin` não é editável pelo cliente.
- Auth via Supabase; a anon key é pública, a service_role nunca entra no bundle.
- `internal.api_cache`, `internal.api_rate_limits` e `internal.raw_payloads` sem acesso público.
- CSP e CORS restritos.
- Logs não incluem `app_key`.

## Estrutura

```text
apps/web/          React + Vite + MapLibre
apps/api/          Backend local (Hono + Node)
apps/ingest/       Catálogo/ETL de datasets abertos
packages/shared/   Tipos, schemas, cores, severidade
packages/api-core/ Router, cache, cliente TfL, metadados
supabase/          Migrações, seed, Edge Functions
docs/              Arquitetura, fontes e roadmap
```

## Documentação

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/data-sources.md`](docs/data-sources.md)
- [`docs/cron.md`](docs/cron.md)
- [`docs/roadmap.md`](docs/roadmap.md)

## Limitações conhecidas

- Status de estação é derivado, não oficial.
- Não há occupancy live na Unified API; datasets de crowding são históricos.
- Step-free exige feed oficial específico e não é inferido de `AccessViaLift`.
- `affectedStops` pode vir vazio; a UI mostra “não informado”.
- Fechamentos noturnos (“Service Closed”) não são automaticamente classificados como disrupção.
- A geometria por ramal ainda não está mapeada para cada `orderedLineRoute`.
- Cenários são topológicos: não modelam frequências, capacidade, tempos de viagem nem
  autocarros de substituição.
- O grafo usa hubs Naptan para ligar entradas canónicas do mesmo complexo; 3 paragens
  de tram (`Centrale`, `Reeves Corner`, `Wellesley Road`) não vêm na sequência
  “Regular” da TfL e aparecem como nós isolados. Não são ligadas por inferência.
- Footfall diário, annual counts, NUMBAT, link flows, train loading e RODS 2017
  estão ingeridos.
- RODS e crowding 2017 são estimativas/perfis históricos; não representam procura
  em tempo real nem passageiros únicos.
- O perfil de crowding de 2017 agrega fluxos internos por estação; não representa
  passageiros únicos nem ocupação de veículos.
- Não há envio de email/push server-side: as notificações são do browser e só com a
  aplicação aberta.
- A administração é read-only; não permite gerir utilizadores nem disparar jobs.
- PTAL não foi incluído por falta de uma camada validada; boroughs ONS estão disponíveis.
- O PDF é gerado via impressão do browser (`/report`), não por um serviço server-side.

## Próximo passo

Manutenção da Fase 6. PTAL só entra se houver uma fonte validada; as 3 paragens de
tram continuam bloqueadas pela sequência em falta. Só avançar com um pedido explícito.

