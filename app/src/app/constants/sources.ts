import { VectorSourceSpecification } from "maplibre-gl";

export function getBlocksSource(
  layer_subpath: string
): VectorSourceSpecification {
  const zxyUrl = `${window.location.origin}/api/tiles/${encodeURIComponent(layer_subpath)}/{z}/{x}/{y}`

  return {
    type: "vector",
    tiles: [zxyUrl],
    promoteId: "path",
  };
}
