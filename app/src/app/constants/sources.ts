import { VectorSourceSpecification } from "maplibre-gl";

export const BLOCKS_SOURCE: VectorSourceSpecification = {
  type: "vector",
  tiles: ["https://pmt.basemapper.app/co_layered_full/{z}/{x}/{y}.mvt"], //6,10 were good
};
