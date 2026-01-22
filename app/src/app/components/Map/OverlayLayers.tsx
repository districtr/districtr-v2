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
  'text-color': '#333',
  'text-halo-color': '#fff',
  'text-halo-width': 1.5,
};

const DEFAULT_TEXT_LAYOUT: Partial<SymbolLayerSpecification['layout']> = {
  'text-font': ['Barlow Regular'],
  'text-size': 12,
  'text-anchor': 'center',
  'text-max-width': 10,
};

interface OverlayLayerProps {
  overlay: Overlay;
}

const OverlayLayer = ({overlay}: OverlayLayerProps) => {
  const sourceId = `overlay-source-${overlay.overlay_id}`;
  const layerId = `overlay-layer-${overlay.overlay_id}`;

  const sourceProps = useMemo(() => {
    if (overlay.data_type === 'pmtiles') {
      return {
        type: 'vector' as const,
        url: overlay.source ? `pmtiles://${overlay.source}` : undefined,
      };
    }
    return {
      type: 'geojson' as const,
      data: overlay.source || undefined,
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

  if (!overlay.source) {
    return null;
  }

  return (
    <Source id={sourceId} {...sourceProps}>
      <Layer {...layerProps} />
    </Source>
  );
};

export const OverlayLayers = () => {
  const availableOverlays = useOverlayStore(state => state.availableOverlays);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);

  const enabledOverlays = useMemo(() => {
    return availableOverlays.filter(overlay => enabledOverlayIds.has(overlay.overlay_id));
  }, [availableOverlays, enabledOverlayIds]);

  return (
    <>
      {enabledOverlays.map(overlay => (
        <OverlayLayer key={overlay.overlay_id} overlay={overlay} />
      ))}
    </>
  );
};

export default OverlayLayers;
