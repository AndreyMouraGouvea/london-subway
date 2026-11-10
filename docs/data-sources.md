# Fontes e endpoints — validação da Fase 0

Validação ao vivo em **2026-11-09/10 UTC**. Os dados da TfL mudam; os campos abaixo foram confirmados nas respostas reais, mas continuam sujeitos a alteração.

## Correções importantes

| Ponto | Achado | Decisão |
|---|---|---|
| Arrivals | `GET /StopPoint/{id}/ArrivalPredictions` devolve **404** | Usar `GET /StopPoint/{id}/Arrivals` (200, `Prediction[]`). |
| Elizabeth line | `GET /Line/Mode/tflrail/Status` devolve **400** | Usar `mode=elizabeth-line` e `line id=elizabeth`. |
| Geometria | `GET /Line/{id}/Route` devolve `routeSections`, sem geometria | Usar `GET /Line/{id}/Route/Sequence/{direction}` e `lineStrings`. |
| Frescura | `line.modified` pode estar meses no passado | Usar `fetchedAt` da nossa coleta e `validityPeriods` oficiais. |
| Crowding | `GET /StopPoint/{id}/Crowding/{line}` devolveu **404** | Usar datasets históricos de crowding. |
| Status de estação | Não existe endpoint equivalente ao de linha | Derivar de linhas servidas + disrupções da estação. |
| Step-free | `AccessViaLift=Yes` não é step-free completo | Deixar `null` até ingerir o feed oficial. |
| StopPoint em lote | `/StopPoint/{ids}` devolve 400 com 23+ IDs | Detalhe de estação é enriquecido on-demand em `GET /stations/:id`. |
| Entradas | `children` de `/Line/{id}/StopPoints` pode vir com lat/lon 0 | `GET /stations/:id` consulta `/StopPoint/{id}` e cacheia por 24 h. |

## Endpoints validados

| Endpoint | Uso | TTL observado | Campos úteis |
|---|---|---|---|
| `GET /Line/Mode/{modes}/Status?detail=true` | Status de todas as linhas | 60 s | `lineStatuses[].statusSeverity`, `statusSeverityDescription`, `reason`, `validityPeriods`, `disruption` |
| `GET /Line/{ids}/Status?detail=true` | Status por linha | 60 s | idem |
| `GET /Line/Mode/{modes}/Disruption` | Disrupções por modo | 60 s | `category`, `type`, `description`, `affectedRoutes`, `affectedStops`, `closureText` |
| `GET /Line/{ids}/Disruption` | Disrupções por linha | 60 s | idem (frequentemente minimalista) |
| `GET /Line/{id}/Route/Sequence/{direction}?serviceTypes=Regular` | Estações, ramais e geometria | 3600 s | `lineStrings[]`, `stations[]`, `stopPointSequences[]`, `orderedLineRoutes[]` |
| `GET /Line/{id}/Route?serviceTypes=Regular` | Metadados de rota | estático | `routeSections[]` (sem geometria) |
| `GET /Line/{id}/StopPoints` | Estações da linha | 86400 s | `id`, `commonName`, `lat`, `lon`, `zone`, `lines[]`, `children[]` |
| `GET /StopPoint/{ids}` | Estação/hub em lote | 86400 s | `additionalProperties[]`, `children[]`, `lat/lon`, `zone` |
| `GET /StopPoint/{id}/Arrivals?count=N` | Previsões | 60 s | `lineId`, `platformName`, `towards`, `expectedArrival`, `timeToStation`, `destinationName` |
| `GET /StopPoint/{ids}/Disruption` | Disrupções da estação | 60 s | `Disruption[]` |
| `GET /StopPoint/Mode/{modes}` | Stop points por modo | 86400 s | `stopPoints[]`, `pageSize`, `total` |
| `GET /Line/Meta/Severity` | Mapa de severidade por modo | estático | `modeName`, `severityLevel`, `description` |
| `GET /Line/Meta/Modes` | Modos disponíveis | estático | `modeName`, flags |
| `GET /Line/{id}/Timetable/{fromStopPointId}` | Timetable (opcional) | 86400 s | `disambiguation`; requer `direction` |

## Limites de uso

- Com `app_key`: plano documentado de **500 req/min**.
- Sem chave: aproximadamente **50 req/min** (limite inferior, não garantido).
- O backend deve impor um orçamento conservador (ex.: 120 req/min) e cachear agressivamente.
- `429` e `5xx` têm retry limitado com backoff; `4xx` não é repetido.

## Datasets abertos verificados

Bucket `https://crowding.data.tfl.gov.uk/`:

- `Network Demand/StationFootfall_2025_2026 .csv` — `TravelDate, DayOfWeek, Station, EntryTapCount, ExitTapCount`.
- `Network Demand/Journeys_2025_2026 .csv` — `TravelDate, DayOfWeek, TubeJourneyCount, BusJourneyCount`.
- `Crowding/StationPassengerLinkFlows.csv` — fluxos por intervalo de 15 min.
- `Crowding/StationNodesDescription.csv` — nós, plataformas, entradas/saídas.
- `Crowding/LUTrainLoadingData.csv` — loading por link estação–estação.
- `Annual Station Counts/2025/AC2025_AnnualisedEntryExit_public.xlsx`.
- `NUMBAT/NBT16-25_AnnualisedBoarders_Outputs.xlsx`.
- `RODS/rods.zip`.

Estado da ingestão: footfall diário, annual station counts 2025, NUMBAT 2016–2025,
link flows/train loading 2017 e RODS 2017 foram ingeridos. RODS usa as folhas
`Boarders`/`Alighters` e é uma estimativa ponderada, reconciliada com Autumn 2017;
não é ocupação em tempo real.

## Feeds que exigem registo TfL

- Station facilities KML.
- Step-free access and toilet data (GTFS/detalhado).
- Live lift disruption feed.
- Stop Structure API.

## GIS

- Boroughs de Londres: ONS Local Authority Districts DEC 2025 (generalised,
  `E09*`), descarregado para `apps/web/public/london-boroughs.geojson`.
- Licença: Open Government Licence v3.0; atribuição “Boundaries © Crown copyright
  and database right 2025, ONS, OGL v3.0”.
- PTAL não foi incluído: não existe uma camada validada no projeto; não é inferido.

## Cores oficiais

Fonte: **TfL Colour Standard, Issue 11 (August 2026)**  
`https://content.tfl.gov.uk/tfl-colour-standard.pdf`

As cores foram extraídas dos valores RGB oficiais e convertidas para hex pelo projeto. O projeto não usa o roundel nem o logotipo da TfL.

## Licenças e atribuição

- Dados TfL: Transport Data Terms and Conditions; atribuição “Information supplied by Transport for London”.
- Basemap: OpenFreeMap / © OpenStreetMap contributors, ODbL.
- O projeto não é afiliado, endossado ou patrocinado pela TfL.
