import React, {useMemo} from 'react';
import {
  getBlocksHoverLayerSpecification,
  getBlocksLayerSpecification,
  getHighlightLayerSpecification,
  LABELS_BREAK_LAYER_ID,
  StyleBuilder,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {Layer} from 'react-map-gl/maplibre';

type DistrictrLayerProps = {
  layerType: 'blocks' | 'hover' | 'highlight';
  layerId: string;
  child?: boolean;
  source?: string;
  beforeId?: string;
};

const styleSpecs: Record<DistrictrLayerProps['layerType'], StyleBuilder> = {
  blocks: getBlocksLayerSpecification,
  hover: getBlocksHoverLayerSpecification,
  highlight: getHighlightLayerSpecification,
};

export const DistrictrLayer: React.FC<DistrictrLayerProps> = ({
  layerType,
  layerId,
  child,
  source,
  beforeId = LABELS_BREAK_LAYER_ID,
}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const captiveIds = useMapStore(state => state.captiveIds);
  const shatterIds = useMapStore(state => state.shatterIds);
  const sourceLayer = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const mapOptions = useMapStore(state => state.mapOptions);
  const _source = source || mapDocument?.gerrydb_table;
  const layerStyle = useMemo(
    () =>
      styleSpecs[layerType]({
        layerId,
        shatterIds,
        captiveIds,
        child,
        mapOptions,
      }),
    [captiveIds, shatterIds, layerId, layerType, child, mapOptions]
  );

  if (!sourceLayer) {
    return null;
  }
  return (
    // @ts-ignore TODO: fix types here...
    <Layer
      {...layerStyle}
      key={`${layerId}-layer`}
      source={_source}
      source-layer={sourceLayer}
      id={layerId}
      beforeId={beforeId}
    />
  );
};
