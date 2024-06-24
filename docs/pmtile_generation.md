# PMTile Tippecanoe recipes

## Most performant combination PMTile options explored thus far:

- `tippecanoe  -pf -pk -ps -o t11.pmtiles co_blocks_wgs4.fgb`
  - `-pf` : Don't limit tiles to 200,000 features
  - `-pk` : Don't limit tiles to 500K bytes
  - `-ps` : Don't simplify lines and polygons
