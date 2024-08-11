import React from "react";
import { Chart, AxisOptions } from "react-charts";
import { useMapStore } from "@/app/store/mapStore";
import ResizableBox from "./ResizableBox";

export const HorizontalBar = () => {
  const { zonePopulations } = useMapStore((state) => ({
    zonePopulations: state.zonePopulations,
  }));
  console.log(zonePopulations);
  const zonePopData = React.useMemo(() => {
    if (zonePopulations.size === 0) return [];
    return Array.from(zonePopulations).map(([zone, population]) => ({
      zone: zone,
      population: population,
    }));
  }, [zonePopulations]);

  const primaryAxis = React.useMemo<AxisOptions<(typeof zonePopData)[number]>>(
    () => ({
      getValue: (datum) => datum.zone,
      type: "categorical",
      label: "Zone",
    }),
    []
  );

  const secondaryAxes = React.useMemo<
    AxisOptions<(typeof zonePopData)[number]>[]
  >(
    () => [
      {
        getValue: (datum) => datum.population,
        label: "Population",
      },
    ],
    []
  );

  // properly format data so that each zone is a bar with the population as the height
  const data = React.useMemo(() => {
    if (zonePopData.length === 0) return [];
    return [
      {
        label: "Population",
        data: zonePopData,
      },
    ];
  }, [zonePopData]);

  if (zonePopulations.size === 0) {
    return <div>No data to display</div>;
  }
  return (
    <ResizableBox>
      <Chart
        options={{
          data,
          primaryAxis,
          secondaryAxes,
        }}
      />
    </ResizableBox>
  );
};
