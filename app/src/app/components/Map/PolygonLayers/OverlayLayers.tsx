'use client';
import {useMemo} from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {useOverlayStore} from '@/app/store/overlayStore';
import {Overlay} from '@/app/utils/api/apiHandlers/types';
import {OVERLAY_LAYER_ID_PREFIXES} from '@/app/constants/map/layerIds';
import {
  DEFAULT_FILL_STYLE,
  DEFAULT_LINE_STYLE,
  DEFAULT_TEXT_LAYOUT,
  DEFAULT_TEXT_PAINT,
  HIGHLIGHT_FILL_COLOR,
  SELECTED_LINE_STYLE,
} from '@/app/constants/map/overlayLayerStyles';
import {useMapStore} from '@/app/store/mapStore';

interface OverlayLayerProps {
  overlay: Overlay;
  selectedFeatureId: string | null;
  isConstraintOverlay: boolean;
  layerBeforeId: string;
}

const OverlayLayer = ({
  overlay,
  selectedFeatureId,
  isConstraintOverlay,
  layerBeforeId,
}: OverlayLayerProps) => {
  const sourceId = `${OVERLAY_LAYER_ID_PREFIXES.source}${overlay.overlay_id}`;
  const layerId = `${OVERLAY_LAYER_ID_PREFIXES.layer}${overlay.overlay_id}`;
  const clickLayerId = `${OVERLAY_LAYER_ID_PREFIXES.click}${overlay.overlay_id}`;
  const selectedLayerId = `${OVERLAY_LAYER_ID_PREFIXES.selected}${overlay.overlay_id}`;
  const paintConstraint = useOverlayStore(state => state.paintConstraint);

  const idProperty = overlay.id_property || 'id';

  const sourceProps = useMemo(() => {
    if (overlay.data_type === 'pmtiles') {
      return {
        type: 'vector' as const,
        url: overlay.source ? `pmtiles://${overlay.source}` : undefined,
        promoteId: idProperty,
      };
    }
    return {
      type: 'geojson' as const,
      data: overlay.source || undefined,
      promoteId: idProperty,
    };
  }, [overlay.data_type, overlay.source]);

  const layerProps = useMemo(() => {
    const baseProps: any = {
      id: layerId,
      beforeId: layerBeforeId,
    };

    // Add source-layer for pmtiles
    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }

    // Apply default styles based on layer type, then override with custom styles
    switch (overlay.layer_type) {
      case 'fill':
        return {
          ...baseProps,
          type: 'fill' as const,
          paint: {
            ...DEFAULT_FILL_STYLE,
            ...(overlay.custom_style?.paint || {}),
          },
          layout: overlay.custom_style?.layout || {},
        };
      case 'line':
        return {
          ...baseProps,
          type: 'line' as const,
          paint: {
            ...DEFAULT_LINE_STYLE,
            ...(overlay.custom_style?.paint || {}),
          },
          layout: overlay.custom_style?.layout || {},
        };
      case 'text':
        // Use symbol layer for text labels
        const textField = overlay.id_property ? ['get', overlay.id_property] : ['get', 'name']; // fallback to 'name' property
        return {
          ...baseProps,
          type: 'symbol' as const,
          paint: {
            ...DEFAULT_TEXT_PAINT,
            ...(overlay.custom_style?.paint || {}),
          },
          layout: {
            ...DEFAULT_TEXT_LAYOUT,
            'text-field': textField,
            ...(overlay.custom_style?.layout || {}),
          },
        };
      default:
        return baseProps;
    }
  }, [layerId, overlay, layerBeforeId]);

  // Click detection layer for line overlays (invisible fill)
  const clickLayerProps = useMemo(() => {
    if (overlay.layer_type !== 'line') return null;

    const baseProps: any = {
      id: clickLayerId,
      type: 'fill' as const,
      beforeId: layerId,
      paint: {
        'fill-color': '#FFFFFF',
        'fill-opacity': 0,
      },
    };

    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }
    if (paintConstraint?.featureId) {
      baseProps.filter = ['!', ['==', ['get', idProperty], paintConstraint.featureId]];
      baseProps.paint['fill-opacity'] = 0.75;
    }

    return baseProps;
  }, [clickLayerId, layerId, overlay, paintConstraint?.featureId]);

  // Selected constraint outline layer (for emphasis)
  const selectedOutlineProps = useMemo(() => {
    if (!isConstraintOverlay || !selectedFeatureId) return null;

    const baseProps: any = {
      id: `${selectedLayerId}-outline`,
      type: 'line' as const,
      paint: SELECTED_LINE_STYLE,
      filter: ['==', ['get', idProperty], selectedFeatureId],
    };

    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }

    return baseProps;
  }, [selectedLayerId, isConstraintOverlay, selectedFeatureId, idProperty, overlay]);

  if (!overlay.source) {
    return null;
  }

  // Hover highlight layer: give it an explicit id (and inherit the overlay's
  // source-layer for pmtiles) so map-libre can dedupe across re-renders.
  // Anonymous layers were accumulating duplicates every re-render.
  const hoverLayerProps: any = {
    id: `${layerId}-highlight`,
    type: 'fill' as const,
    paint: HIGHLIGHT_FILL_COLOR,
  };
  if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
    hoverLayerProps['source-layer'] = overlay.source_layer;
  }

  return (
    <>
      <Source id={sourceId} {...sourceProps}>
        {/* Main overlay layer */}
        <Layer {...layerProps} />
        {/* Hover highlight layer */}
        <Layer {...hoverLayerProps} />
        {/* Selected constraint outline layer */}
        {selectedOutlineProps && <Layer {...selectedOutlineProps} />}
        {/* Invisible click layer for line overlays */}
        {clickLayerProps && <Layer {...clickLayerProps} />}
      </Source>
    </>
  );
};

export const OverlayLayers = ({layerBeforeId}: {layerBeforeId: string}) => {
  const availableOverlays = useMapStore(state => state.mapDocument?.overlays ?? []);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);

  const enabledOverlays = useMemo(() => {
    return availableOverlays.filter(overlay => enabledOverlayIds.has(overlay.name));
  }, [availableOverlays, enabledOverlayIds]);

  return (
    <>
      {enabledOverlays.map(overlay => {
        const isConstraintOverlay = paintConstraint?.overlayId === overlay.overlay_id;

        return (
          <OverlayLayer
            key={overlay.overlay_id}
            overlay={overlay}
            selectedFeatureId={isConstraintOverlay ? paintConstraint.featureId : null}
            isConstraintOverlay={isConstraintOverlay}
            layerBeforeId={layerBeforeId}
          />
        );
      })}
    </>
  );
};

export default OverlayLayers;
