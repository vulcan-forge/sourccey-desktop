# REST API configuration

Desktop account login and robot catalog requests use the Website REST API at
`https://api.vulcanrobotics.ai/v1` (or the staging Website API when staging is selected).
Password login posts to `/auth/login`; desktop Google/GitHub sign-in starts at
`/auth/google` or `/auth/github`. Errors use ProblemDetails (`detail` and `code`).
Catalog lists return `items`, `totalCount`, `nextCursor`, and `previousCursor`.
Packaged desktop builds read the catalog through native HTTP because Website CORS
does not allow Tauri's application origin. The native command allows only the two
public robot catalog GET routes and their documented query parameters.

In Developer settings, enter a REST API URL ending in `/v1`. The local environment
uses this URL for Website requests as well as Studio services. Browser development
uses `NEXT_PUBLIC_REST_API_URL` from `.env`. Packaged Tauri apps use their saved runtime
settings. Old saved `custom_graphql_api_url` values and the legacy
`NEXT_PUBLIC_GRAPHQL_API_URL` variable are accepted and converted from `/v1/graphql`
to `/v1`; `/api/v1` configuration values are also normalized to `/v1`.

Studio dataset sync and kiosk pairing already use REST and retain their existing
Studio hosts and `/api/v1` routes. Dataset sync's `VULCAN_DATASET_SYNC_API_BASE_URL`
override remains an API origin without `/v1`. These routes are independent of the
Website account/catalog routes. Local robot storage continues through Tauri.

Run `bun run test:rest-ui` for headless browser checks of password login, error
handling, native catalog transport, OAuth URLs, and developer URL saves. HTTP and
native boundaries are mocked; no real account or robot is used.

