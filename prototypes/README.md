# Prototypes

All prototypes, whether for services, APIs, frontend tests, etc. should be kept here. Each prototype should be in its own directory.

- `automerge-blocks`: Test using [automerge CRDT](https://automerge.org/) to manage documents / block-level assignments. **Status**: Won't pursue due to perf limitations.
- `deckgl-blocks`: Test using [DeckGL](https://deck.gl/) and [GeoParquets](https://observablehq.com/@kylebarron/geoarrow-and-geoparquet-in-deck-gl) for both rendering and metric calculation (thought the latter part has yet to be tested). **Status**: Still much to explore but decision is not to pursue for now while we go down the PMTiles route.
- `v1`: Previous work done to date by UChicago DSI team. **Status**: On hold.

Prototypes are documented in more detail [here](https://docs.google.com/document/d/1bx-mhIMPUxD8FxZRCbiz6zk3_TfdER7SBWO3Z_27EKc/edit).
