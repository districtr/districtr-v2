import { VectorSourceSpecification } from "maplibre-gl";

export const BLOCKS_SOURCE: VectorSourceSpecification = {
  type: "vector",
  tiles: ["https://pmt.basemapper.app/t11/{z}/{x}/{y}.mvt"], //6,10 were good
};
