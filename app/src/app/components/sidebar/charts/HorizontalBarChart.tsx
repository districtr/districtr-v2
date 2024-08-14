// import React from "react";
// import { Chart, AxisOptions } from "react-charts";
import { useMapStore } from "@/app/store/mapStore";
// import ResizableBox from "./ResizableBox";

// export const HorizontalBar = () => {
//   const { zonePopulations } = useMapStore((state) => ({
//     zonePopulations: state.zonePopulations,
//   }));
//   console.log(zonePopulations);
//   const zonePopData = React.useMemo(() => {
//     if (zonePopulations.size === 0) return [];
//     return Array.from(zonePopulations).map(([zone, population]) => ({
//       zone: zone,
//       population: population,
//     }));
//   }, [zonePopulations]);

//   const primaryAxis = React.useMemo<AxisOptions<(typeof zonePopData)[number]>>(
//     () => ({
//       getValue: (datum) => datum.zone,
//       type: "categorical",
//       label: "Zone",
//     }),
//     []
//   );

//   const secondaryAxes = React.useMemo<
//     AxisOptions<(typeof zonePopData)[number]>[]
//   >(
//     () => [
//       {
//         getValue: (datum) => datum.population,
//         label: "Population",
//       },
//     ],
//     []
//   );

//   // properly format data so that each zone is a bar with the population as the height
//   const data = React.useMemo(() => {
//     if (zonePopData.length === 0) return [];
//     return [
//       {
//         label: "Population",
//         data: zonePopData,
//       },
//     ];
//   }, [zonePopData]);

//   if (zonePopulations.size === 0) {
//     return <div>No data to display</div>;
//   }
//   return (
//     <ResizableBox>
//       <Chart
//         options={{
//           data,
//           primaryAxis,
//           secondaryAxes,
//         }}
//       />
//     </ResizableBox>
//   );
// };

import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  ResponsiveContainer,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";

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
      population: population,
    }));
  }, [zonePopulations]);
  console.log(zonePopData);

  useEffect(() => {
    setData(zonePopData);
  }, [zonePopData]);

  if (zonePopulations.size === 0) {
    return <div>No data to display</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight="200px">
      <BarChart
        width={150}
        height={400}
        data={data}
        layout={"vertical"}
        barSize={20}
        margin={{ top: 15, right: 30, left: 20, bottom: 15 }}
        barGap={0}
      >
        <XAxis
          datakey="population"
          allowDataOverflow={true}
          type="number"
          domain={[0, "maxData"]}
        />
        <Bar dataKey="population" fill="#8884d8">
          <LabelList dataKey="name" position="right" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};
