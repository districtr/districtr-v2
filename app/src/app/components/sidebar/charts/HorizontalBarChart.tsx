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

// HorizontalBarChart.js
import React, { PureComponent } from "react";
import { BarChart, Bar, ResponsiveContainer } from "recharts";

// Sample data
const data = [
  { name: "Group A", value: 4000 },
  { name: "Group B", value: 3000 },
  { name: "Group C", value: 2000 },
  { name: "Group D", value: 2780 },
  { name: "Group E", value: 1890 },
];

export const HorizontalBar = () => {
  const { zonePopulations } = useMapStore((state) => ({
    zonePopulations: state.zonePopulations,
  }));
  // console.log(zonePopulations);
  const zonePopData = React.useMemo(() => {
    if (zonePopulations.size === 0) return [];
    return Array.from(zonePopulations).map(([zone, population]) => ({
      name: zone,
      population: population,
    }));
  }, [zonePopulations]);
  console.log(zonePopData);

  if (zonePopulations.size === 0) {
    return <div>No data to display</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%" minHeight="200px">
      <BarChart width={150} height={400} data={zonePopData} layout={"vertical"}>
        <Bar dataKey="population" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
};
