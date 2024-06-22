import { AutomergeUrl } from "@automerge/automerge-repo";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { Plan } from "../App";
import { useState } from "react";

import * as arrow from "apache-arrow";
import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import { useEffect } from "react";

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
  mvp: {
    mainModule: duckdb_wasm,
    mainWorker: mvp_worker,
  },
  eh: {
    mainModule: duckdb_wasm_eh,
    mainWorker: eh_worker,
  },
};
// Select a bundle based on browser checks
const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
// Instantiate the asynchronus version of DuckDB-wasm
const worker = new Worker(bundle.mainWorker!);
const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

export default function Stats({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<Plan>(docUrl);
  const [table, setTable] = useState<arrow.Table>();

  async function readBlockData() {
    await db.registerFileURL(
      "remote.parquet",
      "/wisconsin_blocks.parquet",
      duckdb.DuckDBDataProtocol.HTTP,
      false,
    );
    const res = await fetch("/wisconsin_blocks.parquet");
    console.log(res);
    await db.registerFileBuffer(
      "buffer.parquet",
      new Uint8Array(await res.arrayBuffer()),
    );

    const c = await db.connect();

    await c.query(`
        CREATE TABLE tl_2023_55_tabblock20 AS
            SELECT * FROM "remote.parquet";
    `);
  }

  async function getBlockPopTotal() {
    if (!doc) {
      return;
    }

    // EOS signal according to Arrorw IPC streaming format
    // See https://arrow.apache.org/docs/format/Columnar.html#ipc-streaming-format
    const c = await db.connect();

    await c.insertArrowTable(
      {
        geoid20: arrow.vectorFromArray(
          Object.keys(doc.assignments),
          new arrow.Utf8(),
        ),
        assignments: arrow.vectorFromArray(
          Object.values(doc.assignments),
          new arrow.Int8(),
        ),
      },
      { name: "assignments" },
    );

    // const arrowTable = arrow.tableFromJSON(data);
    // await db.registerFileBuffer("assignments", arrow.tableToIPC(arrowTable));

    const table = await c.query(`
        SELECT
          assignment,
          SUM(pop20) as tpop
        FROM tl_2023_55_tabblock20
        LEFT JOIN assignments
        ON tl_2023_55_tabblock20.geoid20 = assignments.geoid20;
    `);
    setTable(table);
    console.log(table.toArray());
    c.close();
  }

  useEffect(() => {
    readBlockData();
  }, []);

  return (
    <div>
      <button onClick={getBlockPopTotal}>Get block pop total</button>
    </div>
  );
}
