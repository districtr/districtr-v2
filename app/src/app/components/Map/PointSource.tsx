'use client';
import {Source} from 'react-map-gl/maplibre';
import {
  EMPTY_FT_COLLECTION,
  SELECTION_POINTS_SOURCE_ID,
  SELECTION_POINTS_SOURCE_ID_CHILD,
} from '@/app/constants/layers';
import {usePointData} from '@/app/hooks/usePointData';

// PointSource component manages the point data sources for both parent and child layers
export const PointSource: React.FC<{children: React.ReactNode}> = ({children}) => {
  const parentData = usePointData(false);
  const childData = usePointData(true);

  return (
    <>
      <Source
        id={SELECTION_POINTS_SOURCE_ID}
        type="geojson"
        promoteId="path"
        data={parentData.current || EMPTY_FT_COLLECTION}
      />
      <Source
        id={SELECTION_POINTS_SOURCE_ID_CHILD}
        type="geojson"
        promoteId="path"
        data={childData.current || EMPTY_FT_COLLECTION}
      />
      {children}
    </>
  );
};
