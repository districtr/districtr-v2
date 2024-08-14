import { VectorSourceSpecification } from "maplibre-gl";

export function getBlocksSource(
  layer_subpath: string
): VectorSourceSpecification {
  return {
    type: "vector",
    url: `pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/${layer_subpath}`,
    promoteId: "path",
  };
}
