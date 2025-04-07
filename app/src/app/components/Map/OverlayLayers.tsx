import { useMapStore } from "@/app/store/mapStore";
import { FilterSpecification } from "maplibre-gl";
import { Source, Layer } from "react-map-gl/maplibre";

const UrbanAreasLayer = () => {
  const show = useMapStore(state => state.mapOptions.activeLayers['urban-areas']);
  const currentStateFp = useMapStore(state => state.mapOptions.currentStateFp);
  if (!show) return null;
  console.log("!!!", show)
  const filter = [
    '==',
    ['slice', ['get', 'GEOID'], 0, 2],
    currentStateFp ? currentStateFp : '--',
  ] as FilterSpecification;

  return <Source
    id={'ua'}
    type="vector"
    url={`pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/tilesets/tl_2024_us_uac20_full.pmtiles`}
    promoteId="path"
  >
  <Layer
    id="ua_boundary"
    beforeId="places_locality"
    type="line"
    source-layer="tl_2024_us_uac20"
    paint={{
      'line-color': '#333',
      'line-opacity': 0.8,
      'line-dasharray': [2, 1],
      'line-width': [
        'interpolate',
        ['exponential', 1.6],
        ['zoom'],
        6,
        0.625,
        9,
        1.625,
        18,
        2.25,
      ],
    }}
    // filter={filter}
  />
  <Layer
    id="ua_label"
    // beforeId={}
    type="symbol"
    source-layer="tl_2024_us_uac20_label"
    minzoom={6}
    layout={{
      'text-field': ['get', 'NAME20'],
      'text-font': ['Barlow Bold'],
      'text-letter-spacing': 0,
      'text-max-width': 12,
      'text-padding': ['interpolate', ['linear'], ['zoom'], 5, 20, 8, 28, 12, 44],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 13, 12, 16],
      'symbol-sort-key': ['get', 'ALAND20'],
    }}
    paint={{
      'text-color': '#666',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    }}
    // filter={filter}
  />
  </Source>
}


export const OverlayLayers = () => {
  return <>
    <UrbanAreasLayer />
  </>
}