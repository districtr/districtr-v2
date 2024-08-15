import { useMapStore } from "@/app/store/mapStore";

import React from "react";
import { BarChart, Bar, ResponsiveContainer } from "recharts";

export const HorizontalBar = () => {
  const { zonePopulations } = useMapStore((state) => ({
    zonePopulations: state.zonePopulations,
  }));

  const zonePopData = React.useMemo(() => {
    if (zonePopulations.size === 0) return [];
    return Array.from(zonePopulations).map(([zone, population]) => ({
      zone: zone,
      population: population,
    }));
  }, [zonePopulations]);

  if (zonePopulations.size === 0) {
    return <div>No data to display</div>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart width={150} height={40} data={zonePopData}>
        <Bar dataKey="uv" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
};
