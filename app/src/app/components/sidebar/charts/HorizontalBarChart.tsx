import { useMapStore } from "@/app/store/mapStore";
import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  LabelList,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { color10 } from "@/app/constants/colors";

export const HorizontalBar = () => {
  const { zonePopulations } = useMapStore((state) => ({
    zonePopulations: state.zonePopulations,
  }));
  const [data, setData] = useState<{ name: string; population: number }[]>([]);

  // console.log(zonePopulations);
  const zonePopData = React.useMemo(() => {
    if (zonePopulations.size === 0) return [];
    return Array.from(zonePopulations).map(([zone, population]) => ({
      name: `Zone ${zone}`,
      zoneId: zone,
      population: population,
    }));
  }, [zonePopulations]);
  console.log(zonePopData);

  useEffect(() => {
    // add a dummy value to set the scale properly
    setData([
      ...zonePopData,
      {
        name: "dummy",
        population: 1,
      },
    ]);
  }, [zonePopData]);

  if (zonePopulations.size === 0) {
    return <div>No data to display</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight="200px">
      <BarChart
        width={150}
        height={500}
        data={data}
        layout={"vertical"}
        barSize={15}
        margin={{ top: 15, right: 30, left: 20, bottom: 15 }}
        barGap={4}
      >
        <XAxis
          datakey="population"
          allowDataOverflow={true}
          type="number"
          domain={[0, "maxData"]}
        />
        <Bar dataKey="population">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={color10[entry.zoneId - 1]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
