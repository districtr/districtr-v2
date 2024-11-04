import {
  SourceSpecification,
  AddLayerObject,
  FilterSpecification,
  DataDrivenPropertyValueSpecification,
  LayerSpecification,
} from 'maplibre-gl';
import {Point} from 'maplibre-gl';
import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_SOURCE_ID,
  CHILD_LAYERS,
  LABELS_BREAK_LAYER_ID,
  PARENT_LAYERS,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {MapStore, useMapStore} from '../store/mapStore';
import {DocumentObject} from './api/apiHandlers';
import {getBlocksSource} from '../constants/sources';

class MapLayerManager {
  addedLayers: string[] = [];
  addedSources: string[] = [];

  constructor() {}
  public get map() {
    return useMapStore.getState().getMapRef();
  }

  public get visibleLayers() {
    return this.map?.getStyle().layers.filter(layer => layer.layout?.visibility === 'visible');
  }

  addSource(id: string, source: SourceSpecification) {
    if (this.map) {
      this.map.addSource(id, source);
      this.addedSources.push(id);
    }
  }
  removeSource(id: string) {
    if (this.map?.getSource(id)) {
      this.map?.removeSource(id);
      this.addedSources = this.addedSources.filter(f => f !== id);
    }
  }
  addLayer(layer: AddLayerObject, beforeId?: string) {
    if (this.map) {
      this.map?.addLayer(layer, beforeId);
      this.addedLayers.push(layer.id);
    }
  }
  removeLayer(id: string) {
    if (this.map?.getLayer(id)) {
      this.map?.removeLayer(id);
      this.addedLayers = this.addedLayers.filter(f => f !== id);
    }
  }
  clearSources() {
    this.addedSources.forEach(this.removeSource);
  }
  clearLayers() {
    this.addedLayers.forEach(this.removeLayer);
  }
  toggleLayerVisibility(layerIds: string[]) {
    const activeLayerIds = this.visibleLayers?.map(layer => layer.id);
    if (!activeLayerIds?.length || !this.map) return [];

    return layerIds.map(layerId => {
      if (activeLayerIds && activeLayerIds.includes(layerId)) {
        this.map?.setLayoutProperty(layerId, 'visibility', 'none');
        return {layerId: layerId, visibility: 'none'};
      } else {
        this.map?.setLayoutProperty(layerId, 'visibility', 'visible');
        return {layerId: layerId, visibility: 'visible'};
      }
    }, {});
  }
}

class BlockSpecificLayerManager extends MapLayerManager {
  getLayerFilter(layerId: string, _shatterIds?: MapStore['shatterIds']) {
    const shatterIds = _shatterIds || useMapStore.getState().shatterIds;
    const isChildLayer = CHILD_LAYERS.includes(layerId);
    const ids = isChildLayer ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];

    if (isChildLayer) {
      return filterBase;
    }
    const parentFilter: FilterSpecification = ['!', filterBase];
    return parentFilter;
  }
  getLayerFill(
    captiveIds?: Set<string>,
    shatterIds?: Set<string>
  ): DataDrivenPropertyValueSpecification<number> {
    const innerFillSpec = [
      'case',
      // geography is locked
      ['boolean', ['feature-state', 'locked'], false],
      0.4,
      // zone is selected and hover is true and hover is not null
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
        [
          'all',
          // @ts-ignore
          ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
          ['boolean', ['feature-state', 'hover'], true],
        ],
      ],
      0.9,
      // zone is selected and hover is false, and hover is not null
      [
        'all',
        // @ts-ignore
        ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
        [
          'all',
          // @ts-ignore
          ['!', ['==', ['feature-state', 'hover'], null]], //< desired behavior but typerror
          ['boolean', ['feature-state', 'hover'], false],
        ],
      ],
      0.7,
      // zone is selected, fallback, regardless of hover state
      // @ts-ignore
      ['!', ['==', ['feature-state', 'zone'], null]], //< desired behavior but typerror
      0.7,
      // hover is true, fallback, regardless of zone state
      ['boolean', ['feature-state', 'hover'], false],
      0.6,
      0.2,
    ] as unknown as DataDrivenPropertyValueSpecification<number>;
    if (captiveIds?.size) {
      return [
        'case',
        ['!', ['in', ['get', 'path'], ['literal', Array.from(captiveIds)]]],
        0.1,
        innerFillSpec,
      ] as DataDrivenPropertyValueSpecification<number>;
    } else if (shatterIds?.size) {
      return [
        'case',
        ['in', ['get', 'path'], ['literal', Array.from(shatterIds)]],
        0,
        innerFillSpec,
      ] as DataDrivenPropertyValueSpecification<number>;
    } else {
      return innerFillSpec;
    }
  }
  getBlocksLayerSpecification(sourceLayer: string, layerId: string): LayerSpecification {
    const layerSpec: LayerSpecification = {
      id: layerId,
      source: BLOCK_SOURCE_ID,
      'source-layer': sourceLayer,
      type: 'line',
      layout: {
        visibility: 'visible',
      },
      paint: {
        'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.8],
        'line-color': '#cecece',
      },
    };
    if (CHILD_LAYERS.includes(layerId)) {
      layerSpec.filter = this.getLayerFilter(layerId);
    }

    return layerSpec;
  }
  getBlocksHoverLayerSpecification(sourceLayer: string, layerId: string): LayerSpecification {
    const layerSpec: LayerSpecification = {
      id: layerId,
      source: BLOCK_SOURCE_ID,
      'source-layer': sourceLayer,
      type: 'fill',
      layout: {
        visibility: 'visible',
      },
      paint: {
        'fill-opacity': this.getLayerFill(),
        'fill-color': ZONE_ASSIGNMENT_STYLE || '#000000',
      },
    };
    if (CHILD_LAYERS.includes(layerId)) {
      layerSpec.filter = this.getLayerFilter(layerId);
    }
    return layerSpec;
  }
  removeBlockLayers() {
    useMapStore.getState().setMapRenderingState('loading');
    [...PARENT_LAYERS, ...CHILD_LAYERS].forEach(this.removeLayer);
    this.removeSource(BLOCK_SOURCE_ID);
  }
  addBlockLayers(mapDocument: DocumentObject) {
    if (!this.map || !mapDocument.tiles_s3_path) {
      console.log('map or mapDocument not ready', mapDocument);
      return;
    }
    const blockSource = getBlocksSource(mapDocument.tiles_s3_path);
    this.removeBlockLayers();
    this.addSource(BLOCK_SOURCE_ID, blockSource);
    this.addLayer(
      this.getBlocksLayerSpecification(mapDocument.parent_layer, BLOCK_LAYER_ID),
      LABELS_BREAK_LAYER_ID
    );
    this?.addLayer(
      this.getBlocksHoverLayerSpecification(mapDocument.parent_layer, BLOCK_HOVER_LAYER_ID),
      LABELS_BREAK_LAYER_ID
    );
    if (mapDocument.child_layer) {
      this?.addLayer(
        this.getBlocksLayerSpecification(mapDocument.child_layer, BLOCK_LAYER_ID_CHILD),
        LABELS_BREAK_LAYER_ID
      );
      this?.addLayer(
        this.getBlocksHoverLayerSpecification(mapDocument.child_layer, BLOCK_HOVER_LAYER_ID_CHILD),
        LABELS_BREAK_LAYER_ID
      );
    }
    useMapStore.getState().setMapRenderingState('loaded');
  }
}

// TODO: Refactor to use these instead of ad-hoc functions
export const BlockLayerManager = new BlockSpecificLayerManager();
export const TemporaryLayerManager = new MapLayerManager();
