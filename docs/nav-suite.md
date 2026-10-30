# Scout nav / dispatch

Scout helps a delivery driver avoid hazards: weather alerts, work zones, incidents. The suite turns public feeds into evidence an agent can cite, lets a crew of local models plan around it, and keeps the driver's location coarse.

## Hazard sources ([`packages/hazard-sources`](../packages/hazard-sources))

| Provider | Coverage | Key |
|---|---|---|
| `nws` | US weather alerts (api.weather.gov) | none |
| `wzdx` | USDOT Work Zone Data Exchange, keyless state feeds | none |
| `511` | state 511 systems on the shared v2 platform | per state |
| `tomtom` | national traffic incidents | yes |

Every feed is normalised into a `HazardEvent` with:
- a stable `event_id` per upstream record;
- a `content_hash` (a new revision when upstream changes);
- `observed_at`, `ingest_host`;
- an HMAC `signature`.

Agents must **cite `event_id`s**, and `verify(event, key)` proves a cited event wasn't altered. Only new or changed events are emitted. Keys come from the environment only. The library is stdlib-only.

Broadcastify's web-player capture is off by default, because it would circumvent their access controls. Scanner audio waits for the official API or the project's own SDR receivers.

## Coordinate-free clients

Clients never send GPS. They ask for **geohash-4 cells** (about 40 × 20 km) and their neighbours, and the hub refuses coordinates by default. Coverage follows coarse demand: the hub polls the cells clients have asked for recently, plus any pinned cells.

## Crew

A manager agent (the only one that reasons) orchestrates narrow specialists, which it reaches as tools: **alert** (alert now or hold), **intel** (nearby hazards as JSON, citing ids), **vet** (is the report consistent with its source), **rank** (route order, JSON), and **core** (builds the driver package from the agreed keys). A dev role keeps the pipeline healthy. Specialists are non-reasoning, temperature 0, non-persona and contract-only. They never write to the blackboard; the manager synthesises and writes under the blackboard's ACL.

## Blackboard

A role-scoped blackboard hub (the same model as the security suite's, see [security-core](../packages/security-core)): each device onboards with an entry token and receives one short-lived token per role, scoped to that role's categories.

## Around it

- A Java map/routing backend serves map shards to each agent box, so routing works without the hub.
- There's an Android client and a public web frontend.
- Agent boxes are provisioned headless (Debian, network-booted).

These live in the nav repo ([routing-scouting-app](https://github.com/scout-hazard-system/routing-scouting-app-to-be-named), [scout_crew](https://github.com/scout-hazard-system/scout_crew)).
