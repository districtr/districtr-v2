import { promises as fs } from "fs";
import path from "path";
import { tableFromIPC } from "apache-arrow";
// import { parseField, parseVector } from "arrow-js-ffi";

// const arrowJsFFI = await import(
//   "https://unpkg.com/arrow-js-ffi@0.2.0/dist/arrow-js-ffi.umd.js"
// );
const parquetModule = await import(
  "https://unpkg.com/parquet-wasm@0.6.0/esm/parquet_wasm.js"
);
// Need to await the default export first to initialize the WebAssembly code
await parquetModule.default();

// const geoarrowModule = await import(
//   "https://unpkg.com/geoarrow-wasm@0.1.0/esm/index.js"
// );

// // Need to await the default export first to initialize the WebAssembly code
// const { memory } = await geoarrowModule.default();
// const geoarrow = geoarrowModule[0];
// const geoarrowMemory = geoarrowModule[1];

const parquetPath = path.resolve(
  "/Users/raphaellaude/Documents/GitHub/paintable-layer-poc/elt/assets/tl_2023_55_tabblock20.parquet",
);

// const parquetPath =
//   "/Users/raphaellaude/Documents/GitHub/paintable-layer-poc/elt/assets/Utah.parquet";

const parquetBuffer = await fs.readFile(parquetPath);
console.log("Parquet buffer read from disk:", parquetBuffer);

const parquetBytes = new Uint8Array(parquetBuffer);
console.log("Parquet bytes:", parquetBytes);

const decodedArrowBytes = parquetModule.readParquet(parquetBytes, {
  batchSize: Math.pow(2, 31),
});

const arrowTable = tableFromIPC(decodedArrowBytes);

console.log(arrowTable.schema.fields[0]);
