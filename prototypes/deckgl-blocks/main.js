import { MapboxOverlay as DeckOverlay } from "@deck.gl/mapbox";
import { SolidPolygonLayer, PathLayer } from "@deck.gl/layers";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import "./style.css";
import { tableFromIPC } from "apache-arrow";

const loadModules = async () => {
  const parquetModule = await import(
    "https://unpkg.com/parquet-wasm@0.6.0/esm/parquet_wasm.js"
  );
  await parquetModule.default();

  const geoarrowModule = await import(
    "https://unpkg.com/geoarrow-wasm@0.1.0/esm/index.js"
  );
  const { memory } = await geoarrowModule.default();
  const geoarrow = geoarrowModule[0];
  const geoarrowMemory = geoarrowModule[1];

  return { parquetModule, geoarrow, geoarrowMemory };
};

const initializeMap = (MAPBOX_TOKEN) => {
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v9",
    accessToken: MAPBOX_TOKEN,
    center: [-111.536258858, 39.393711569], // Utah
    // center: [-89.910271927, 44.541378574], // Wisconsin
    zoom: 7,
    bearing: 0,
    pitch: 0,
  });

  return map;
};

const getData = async () => {
  const parquetPath = "./Utah.parquet";
  // const parquetPath = "./wisconsin_blocks.parquet";
  // const parquetPath = "./tl_2023_55_tabblock20.parquet";
  const parquetBytes = new Uint8Array(
    await fetch(parquetPath).then((response) => response.arrayBuffer()),
  );
  return parquetBytes;
};

const processData = async (parquetModule, parquetBytes) => {
  const decodedArrowBytes = await parquetModule.readParquet(parquetBytes, {
    batchSize: Math.pow(2, 31),
  });
  // console.log(decodedArrowBytes);
  const arrowTable = tableFromIPC(decodedArrowBytes.intoIPCStream());
  // console.log(arrowTable);

  let geometryColumn = arrowTable.getChildAt(0);
  // let geometryColumn = arrowTable.getChild("geometry");

  // console.log(geometryColumn);
  // console.log(geometryColumn.data[0].valueOffsets);

  // const firstGeometry = geometryColumn.get(0);
  // console.log(firstGeometry);
  // const firstRing = firstGeometry.get(0);
  // console.log(firstRing);
  // const firstCoord = firstRing.get(0);
  // console.log(firstCoord.toArray());

  // let polygonIndices = geometryColumn.getChildAt(0).data[0].valueOffsets;
  let polygonIndices = geometryColumn.data[0].valueOffsets;
  let ringIndices = geometryColumn.getChildAt(0).data[0].valueOffsets;

  const resolvedIndices = new Int32Array(polygonIndices.length);
  for (let i = 0; i < resolvedIndices.length; ++i) {
    // Perform the lookup into the ringIndices array using the polygonIndices array
    resolvedIndices[i] = ringIndices[polygonIndices[i]];
  }

  //  let coordinateVector = geometryColumn.getChildAt(0).getChildAt(0)

  const flatCoordinateVector = geometryColumn
    .getChildAt(0)
    .getChildAt(0)
    .getChildAt(0);
  const flatCoordinateArray = flatCoordinateVector.data[0].values;
  // console.log(flatCoordinateArray);

  return { arrowTable, resolvedIndices, flatCoordinateArray };
};

const main = async () => {
  const { parquetModule, geoarrow, geoarrowMemory } = await loadModules();

  const MAPBOX_TOKEN = import.meta.env.VITE_MapboxAccessToken;
  const map = initializeMap(MAPBOX_TOKEN);

  map.on("load", async () => {
    const parquetBytes = await getData();
    const { arrowTable, resolvedIndices, flatCoordinateArray } =
      await processData(parquetModule, parquetBytes);

    // Fast
    const layer = new SolidPolygonLayer({
      id: `layer-${Date.now()}`,
      data: {
        length: arrowTable.numRows,
        startIndices: resolvedIndices,
        attributes: {
          getPolygon: { value: flatCoordinateArray, size: 2 },
        },
      },
      _normalize: false,
      _windingOrder: "CCW",
      getFillColor: [0, 100, 60, 160],
      // pickable: true,
    });

    // Slow
    // const outline = new PathLayer({
    //   id: `layer-line-${Date.now()}`,
    //   data: {
    //     length: arrowTable.numRows,
    //     startIndices: resolvedIndices,
    //     attributes: {
    //       getPath: { value: flatCoordinateArray, size: 2 },
    //     },
    //   },
    //   getColor: [80, 80, 80],
    //   getWidth: 1,
    //   widthMinPixels: 1,
    //   widthMaxPixels: 4,
    //   jointRounded: true,
    //   _pathType: "loop",
    // });

    const deckOverlay = new DeckOverlay({
      layers: [layer],
    });

    map.addControl(deckOverlay);
    map.addControl(new mapboxgl.NavigationControl());
  });
};

main();
