'use client';
import {useMemo} from 'react';
import {Layer, Source} from 'react-map-gl/maplibre';
import {useOverlayStore} from '@/app/store/overlayStore';
import {Overlay} from '@/app/utils/api/apiHandlers/types';
import {FillLayerSpecification, LineLayerSpecification, SymbolLayerSpecification} from 'maplibre-gl';

const DEFAULT_FILL_STYLE: Partial<FillLayerSpecification['paint']> = {
  'fill-color': '#627BC1',
  'fill-opacity': 0.3,
  'fill-outline-color': '#627BC1',
};

const DEFAULT_LINE_STYLE: Partial<LineLayerSpecification['paint']> = {
  'line-color': '#627BC1',
  'line-width': 2,
  'line-opacity': 0.8,
};

const DEFAULT_TEXT_PAINT: Partial<SymbolLayerSpecification['paint']> = {
  'text-color': '#627BC1',
  'text-halo-color': '#fff',
  'text-halo-width': 1.5,
};

const DEFAULT_TEXT_LAYOUT: Partial<SymbolLayerSpecification['layout']> = {
  'text-font': ['Barlow Bold'],
  'text-size': 14,
  'text-anchor': 'center',
  'text-max-width': 10,
};

// Hover highlight style for constraint selection mode
const HOVER_FILL_STYLE: Partial<FillLayerSpecification['paint']> = {
  'fill-color': '#FF9500',
  'fill-opacity': 0.4,
};

// Selected constraint highlight style
const SELECTED_FILL_STYLE: Partial<FillLayerSpecification['paint']> = {
  'fill-color': '#FF6B00',
  'fill-opacity': 0.5,
};

const SELECTED_LINE_STYLE: Partial<LineLayerSpecification['paint']> = {
  'line-color': '#FF6B00',
  'line-width': 3,
  'line-opacity': 1,
};

interface OverlayLayerProps {
  overlay: Overlay;
  hoveredFeatureId: string | null;
  selectedFeatureId: string | null;
  isConstraintOverlay: boolean;
}

const OverlayLayer = ({
  overlay,
  hoveredFeatureId,
  selectedFeatureId,
  isConstraintOverlay,
}: OverlayLayerProps) => {
  const sourceId = `overlay-source-${overlay.overlay_id}`;
  const layerId = `overlay-layer-${overlay.overlay_id}`;
  const clickLayerId = `overlay-click-${overlay.overlay_id}`;
  const hoverLayerId = `overlay-hover-${overlay.overlay_id}`;
  const selectedLayerId = `overlay-selected-${overlay.overlay_id}`;
  const overlayFeature = useOverlayStore(state => state.paintConstraint);
  const showOverlayFeature = overlayFeature?.overlayId === overlay.overlay_id;

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
      beforeId: 'places_locality',
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
        const textField = overlay.id_property
          ? ['get', overlay.id_property]
          : ['get', 'name']; // fallback to 'name' property
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
  }, [layerId, overlay]);

  // Click detection layer for line overlays (invisible fill)
  const clickLayerProps = useMemo(() => {
    if (overlay.layer_type !== 'line') return null;

    const baseProps: any = {
      id: clickLayerId,
      type: 'fill' as const,
      beforeId: layerId,
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0,
      },
    };

    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }

    return baseProps;
  }, [clickLayerId, layerId, overlay]);

  // Hover highlight layer
  const hoverLayerProps = useMemo(() => {
    if (!hoveredFeatureId) return null;

    const baseProps: any = {
      id: hoverLayerId,
      type: 'fill' as const,
      paint: HOVER_FILL_STYLE,
      filter: ['==', ['get', idProperty], hoveredFeatureId],
    };

    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }

    return baseProps;
  }, [hoverLayerId, hoveredFeatureId, idProperty, overlay]);

  // Selected constraint highlight layer
  const selectedLayerProps = useMemo(() => {
    if (!isConstraintOverlay || !selectedFeatureId) return null;

    const baseProps: any = {
      id: selectedLayerId,
      type: 'fill' as const,
      paint: SELECTED_FILL_STYLE,
      filter: ['==', ['get', idProperty], selectedFeatureId],
    };

    if (overlay.data_type === 'pmtiles' && overlay.source_layer) {
      baseProps['source-layer'] = overlay.source_layer;
    }

    return baseProps;
  }, [selectedLayerId, isConstraintOverlay, selectedFeatureId, idProperty, overlay]);

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

  return (
    <>
    <Source id={sourceId} {...sourceProps}>
      {/* Main overlay layer */}
      <Layer {...layerProps} />
      {/* Hover highlight layer */}
      {hoverLayerProps && <Layer {...hoverLayerProps} />}
      {/* Selected constraint fill layer */}
      {selectedLayerProps && <Layer {...selectedLayerProps} />}
      {/* Selected constraint outline layer */}
      {selectedOutlineProps && <Layer {...selectedOutlineProps} />}
      {/* Invisible click layer for line overlays */}
      {clickLayerProps && <Layer {...clickLayerProps} />}
    </Source>
    {showOverlayFeature && 
      <Source
        id={sourceId + '-overlay-feature'}
        type="geojson"
        data={{
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: overlayFeature?.geometry,
              properties: {
                name: overlayFeature?.featureName,
              },
            },
          ],  
        }}
      >
        <Layer
          id={`overlay-feature-line-${overlay.overlay_id}`}
          type="line"
          paint={{
            'line-color': '#FF0000',
            'line-width': 4,
            'line-opacity': 1,
          }}
        />
      </Source>
    }
    </>
  );
};

export const OverlayLayers = () => {
  const availableOverlays = useOverlayStore(state => state.availableOverlays);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const hoveredOverlayFeature = useOverlayStore(state => state.hoveredOverlayFeature);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);

  const enabledOverlays = useMemo(() => {
    return availableOverlays.filter(overlay => enabledOverlayIds.has(overlay.name));
  }, [availableOverlays, enabledOverlayIds]);

  return (
    <>
      {enabledOverlays.map(overlay => {
        const isHoveredOverlay = hoveredOverlayFeature?.overlayId === overlay.overlay_id;
        const isConstraintOverlay = paintConstraint?.overlayId === overlay.overlay_id;

        return (
          <OverlayLayer
            key={overlay.overlay_id}
            overlay={overlay}
            hoveredFeatureId={isHoveredOverlay ? hoveredOverlayFeature.featureId : null}
            selectedFeatureId={isConstraintOverlay ? paintConstraint.featureId : null}
            isConstraintOverlay={isConstraintOverlay}
          />
        );
      })}
    </>
  );
};

export default OverlayLayers;
