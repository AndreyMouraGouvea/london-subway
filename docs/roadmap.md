# Roadmap

> Estado atual: Fases 0–6 entregues. O projeto entra em manutenção; novas fases ou
> expansões só com pedido explícito.

## Fase 1 — Esqueleto executável ✅

- Monorepo, React/Vite/TS, Tailwind, MapLibre.
- Layout CCO, dashboard, alertas, exploração e fontes.
- `packages/shared` com contratos e constantes reais.
- `packages/api-core` com health, cache, logging e cliente TfL.
- Migrações Supabase, RLS, Realtime, Storage e seed.
- Edge Function `api` com `/health`, empacotada por esbuild.
- CI, configs de deploy e documentação.
- Migrações, seed, RLS, trigger PostGIS e health da Edge Function validados localmente.

**Critério de aceite:** `npm run build`, `npm run typecheck` e `npm run test` passam; app abre com mapa e estados vazios honestos.

## Fase 2 — Ingestão e normalização ✅

- `sync-reference`, `sync-status`, `sync-disruptions` e `sync-cleanup`.
- Normalização de linhas, estações canónicas, entradas, facilities, route sequences, severidade e disrupções.
- Snapshots idempotentes em `line_status_snapshots` e `network_status_snapshots`.
- Endpoints: `/network`, `/network/status`, `/lines`, `/lines/:id`, `/lines/:id/status`, `/lines/:id/disruptions`, `/lines/:id/route`, `/lines/:id/stations`, `/stations`, `/stations/:id`, `/stations/:id/arrivals`, `/stations/:id/disruptions`, `/disruptions`, `/dashboard/summary`, `/sources`.
- Cache Postgres com TTL e fallback stale para arrivals.
- Testes de normalização e 34 testes no total.
- Frontend ligado aos resumos reais: CCO, dashboard, alertas, explorador e fontes.

**Critério de aceite:** status real da TfL aparece nos endpoints com `fetchedAt`, `isStale` e `dataSourceStatus` corretos; 20 linhas, 509 estações canónicas e 20 geometrias sincronizadas.

## Fase 3 — CCO interativo ✅

- Camadas de 20 linhas e 509 estações no MapLibre.
- Cores oficiais + modo status.
- Clique em linha/estação, painel lateral, multi-seleção de até 3 linhas.
- Filtros por modo, status, lifts, WC e WiFi.
- Busca por estação/linha com flyTo.
- Deep links `?line=` / `?station=`.
- Painéis de linha e estação com status, disrupções, facilities, entradas e arrivals.
- Estados de cache/stale/indisponível.
- Exportação CSV/GeoJSON.

**Critério de aceite:** mapa prioritário, painéis não obscurecem a rede, nenhum dado fictício.

## Fase 4 — Tempo real, histórico e dashboard ✅

- Realtime em `line_status_snapshots`, `disruptions`, `network_status_snapshots`, com invalidação agrupada das queries.
- Polling de 60 s como fallback e badge `Tempo real`/`Polling`.
- Agregados horários particionados por mês (`network_status_hourly`, `line_status_hourly`), atualizados por `ldt_rollup_status_hourly` no fim do `sync-status`.
- Endpoint `/dashboard/history?hours=6|24|72` com série por banda e top linhas por tempo em disrupção.
- Gráficos Recharts: área empilhada da rede e barras horizontais por linha.
- Página de alertas com filtros reais por banda, linha, âmbito e pesquisa.
- `/data-health` e `/jobs`: fontes, jobs recentes, cobertura e retenção.
- Retenção centralizada em `ldt_apply_retention` (snapshots, cache, jobs e partições antigas).
- Os snapshots em bruto continuam a ser a fonte de verdade; a agregação é derivada e `historical`.

**Critério de aceite:** painel atualiza ao inserir novo snapshot; falha da TfL não derruba a UI.

**Nota de implementação:** as tabelas de snapshots em tempo real não foram convertidas em
particionadas. A conversão exigiria incluir `captured_at` nas chaves únicas e poderia
interferir com a publicação Realtime; a retenção de 90 dias mantém-nas pequenas. O
particionamento foi aplicado às tabelas horárias, onde o volume cresce de forma contínua.

## Fase 5 — Digital twin analítico (5.1, 5.2 e 5.3 entregues)

### Entregue 5.1

- Ingestão de footfall diário real 2025–2026: 286 190 registos, 433 estações, 2025-01-01 → 2026-10-31.
- Resolução explícita de nomes TfL → IDs canónicos, com aliases e relatório de heurísticas; 0 nomes não correspondidos.
- Grafo estação–segmento derivado de `line_stations`, com transferências entre entradas canónicas do mesmo hub Naptan.
- Indicadores de acessibilidade observada (lifts, WC, WiFi, interchanges), sem inferir step-free de `AccessViaLift`.
- Métricas de conectividade, articulações e impacto topológico por linha.
- Simulador de fecho de estação e falha de linha, com premissas visíveis e `dataQuality = scenario`.
- Página `/analytics` com KPIs, articulações, resiliência, cenários e séries históricas.
- Endpoints `/analytics/network`, `/analytics/scenarios`, `/analytics/footfall/summary` e `/analytics/footfall/stations/:id`.

### Entregue 5.2

- Annual station counts 2025: 428 estações, 2,92 mil milhões de entradas+saídas.
- NUMBAT 2016–2025: 18 linhas, 180 observações anuais em `line_annual_boardings`.
- Link flows 2017: 22 680 perfis por estação/intervalo (270 estações).
- Train loading 2017: 57 453 perfis por ligação/intervalo (270 estações).
- Endpoints `/analytics/annual/summary`, `/analytics/boardings` e `/analytics/crowding/stations/:id`.
- UI com annual counts, boardings por linha e perfil típico de crowding de 15 min.

### Entregue 5.3

- RODS 2017: 121 716 perfis de boarders/alighters por estação, linha, direção e intervalo de 15 min (267 estações).
- Ingestão do ZIP oficial, parsing `.xls` com SheetJS e resolução line-aware de Hammersmith/Edgware Road/Paddington.
- Endpoint `/analytics/rods/stations/:id?metric=boarders|alighters`.
- UI com toggle boarders/alighters e perfil de 84 intervalos por estação.
- Rótulo explícito: estimativas ponderadas do RODS 2017, reconciliadas com Autumn 2017; histórico, não tempo real.

### Pendente / sem fonte

- Tempos de viagem e frequências: não existem nos dados atuais; não serão inventados.
- 3 paragens de tram: a própria sequência “Regular” da TfL as omite; não são ligadas por inferência.

**Critério de aceite:** premissas visíveis, resultados derivados e nenhuma alegação de tempo real.
Os subconjuntos 5.1, 5.2 e 5.3 cumprem este critério.

## Fase 6 — Produto (entregue)

- Supabase Auth email/palavra-passe, perfil e sessão persistente.
- Favoritos de linhas e estações (`user_favorites`, RLS por utilizador).
- Subscrições de alertas por linha com limiar de banda (`user_alert_subscriptions`).
- Notificações do browser com a aplicação aberta; sem push/email server-side.
- Administração read-only em `/admin` para `profiles.is_admin`.
- Relatório operacional em `/report` com impressão/PDF do browser.
- Camada GIS de boroughs de Londres (ONS, OGL v3.0), com toggle no CCO.
- PTAL não incluído por falta de camada validada; não foi inventado.
- Escala tipográfica global aumentada para 18px e tamanhos arbitrários em rem.

**Critério de aceite:** funcionalidades de conta protegidas por RLS, administração sem
exposição de service_role, PDF imprimível e nenhuma camada/dado inventado.

