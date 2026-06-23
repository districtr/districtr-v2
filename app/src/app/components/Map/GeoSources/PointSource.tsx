'use client';
import {Source} from 'react-map-gl/maplibre';
import {
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
} from '@/app/constants/map/layerIds';
import {usePointData} from '@/app/hooks/usePointData';

// PointSource component manages the point data sources for both parent and child layers
export const PointSource: React.FC<{children: React.ReactNode; isPublic?: boolean}> = ({
  children,
  isPublic,
}) => {
  const parentData = usePointData(false, isPublic);
  const childData = usePointData(true, isPublic);

  return (
    <>
      <Source id={SELECTION_POINTS_SOURCE_ID} type="geojson" promoteId="path" data={parentData} />
      <Source
        id={SELECTION_POINTS_SOURCE_ID_CHILD}
        type="geojson"
        promoteId="path"
        data={childData}
      />
      {children}
    </>
  );
};
