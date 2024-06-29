"use client";
import { MapComponent } from "./components/Map";
import { useEffect, useRef } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { initDuckDB } from "./constants/duckdb.service";
import { SidebarComponent } from "./components/Sidebar";

export default function Home() {
  const db = useRef<duckdb.AsyncDuckDB | null>(null);

  useEffect(() => {
    const init = async () => {
      db.current = await initDuckDB();
      try {
        await setupZonesTable(db.current);
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  async function setupZonesTable(db: duckdb.AsyncDuckDB) {
    const c = await db.connect();
    await c.query(
      `CREATE TABLE assignments (geoid VARCHAR PRIMARY KEY, zone INTEGER);`,
    );
  }

  return (
    <main>
      <div className="h-screen w-screen flex items-center justify-between p">
        <MapComponent db={db} />
        <SidebarComponent db={db} />
      </div>
    </main>
  );
}
