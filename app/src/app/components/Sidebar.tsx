import React from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { ResultsComponent } from "./Results";
import { ZoneTypeSelector } from "./Picker";
import { Button, Box, Text, Heading } from "@radix-ui/themes";

interface SidebarComponentProps {
  db: React.MutableRefObject<duckdb.AsyncDuckDB | null>;
}

export const SidebarComponent: React.FC<SidebarComponentProps> = ({ db }) => {
  const [dbIsReady, setDbIsReady] = React.useState(false);
  const [result, setResult] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (db !== null) {
      setDbIsReady(true);
    }
  }, [db]);

  const calculatePopulations = async (db: duckdb.AsyncDuckDB | null) => {
    if (!db) return;
    const c = await db.connect();

    let query = await c.query(
        `SELECT zone, count(*) as tot from assignments group by zone;`,
      ),
      result = query.toArray().map((row) => row.toArray());

    setResult(result);
    console.log(result);
  };

  return (
    <div className="h-full w-sidebar">
      <Box m="3">
        <Heading as="h1" size="4">
          Map Component
        </Heading>
        {dbIsReady ? (
          <Text size="2" color="green">
            Database is ready
          </Text>
        ) : (
          <Text size="2" color="gray">
            Database is not ready
          </Text>
        )}
        <ZoneTypeSelector />
        <Button
          disabled={!dbIsReady}
          onClick={() => calculatePopulations(db.current)}
        >
          Calculate number of assigned zones
        </Button>
        <ResultsComponent results={result} />
      </Box>
    </div>
  );
};
