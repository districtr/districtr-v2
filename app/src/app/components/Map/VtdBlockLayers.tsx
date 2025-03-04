import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
  BLOCK_SOURCE_ID,
  getLayerFill,
  LABELS_BREAK_LAYER_ID,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {useDemographyStore} from '@/app/store/demographicMap';
import {useMapStore} from '@/app/store/mapStore';
import {FilterSpecification} from 'maplibre-gl';
import {useLayoutEffect, useState} from 'react';
import {useEffect} from 'react';
import {useMemo} from 'react';
import {Source, Layer, useMap} from 'react-map-gl/maplibre';
import {getDemographyColorScale} from '@/app/utils/demography/colorScales';

export const VtdBlockLayers: React.FC<{
  isDemographicMap?: boolean;
}> = ({isDemographicMap}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setMapRenderingState = useMapStore(state => state.setMapRenderingState);
  const showDemographicMap = useMapStore(state => state.mapOptions.showDemographicMap);
  const demographicVariable = useDemographyStore(state => state.variable);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const shatterIds = useMapStore(state => state.shatterIds);
  const [clearOldSource, setClearOldSource] = useState(false);
  const showDemography = isDemographicMap || showDemographicMap === 'overlay';
  const mapRef = useMap();
  const numberOfBins = useDemographyStore(state => state.numberOfBins);

  useEffect(() => {
    // clears old source before re-adding
    setClearOldSource(true);
    setTimeout(() => {
      setClearOldSource(false);
      setMapRenderingState('loaded');
    }, 10);
  }, [mapDocument?.tiles_s3_path]);

  const handleDemographyRender = ({numberOfBins}: {numberOfBins?: number}) => {
    const _map = mapRef.current?.getMap();
    if (_map) {
      const updateFn = () => {
        const mapScale = getDemographyColorScale({
          variable: demographicVariable,
          mapRef: _map,
          shatterIds,
          mapDocument,
          numberOfBins: numberOfBins || 5,
        }) as any;
        setScale(mapScale);
        return mapScale;
      };
      const sourceIsLoaded = _map?.getSource(BLOCK_SOURCE_ID);
      if (sourceIsLoaded) {
        return updateFn();
      } else {
        _map.on('load', () => {
          const r = updateFn();
          if (r) {
            _map.off('load', updateFn);
          }
        });
      }
    }
    return false;
  };

  useLayoutEffect(() => {
    if (showDemography) {
      handleDemographyRender({numberOfBins});
    }
  }, [
    numberOfBins,
    showDemography,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
  ]);

  if (!mapDocument || clearOldSource) return null;

  return (
    <>
      <Source
        id={BLOCK_SOURCE_ID}
        type="vector"
        url={`pmtiles://${process.env.NEXT_PUBLIC_S3_BUCKET_URL}/${mapDocument.tiles_s3_path}`}
        promoteId="path"
      >
        {!isDemographicMap && (
          <>
            <ZoneLayerGroup />
            <ZoneLayerGroup child />
          </>
        )}
        {!!showDemography && (
          <>
            <DemographicLayer />
            <DemographicLayer child />
          </>
        )}
      </Source>
    </>
  );
};

export const DemographicLayer: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const shatterIds = useMapStore(state => state.shatterIds);
  const captiveIds = useMapStore(state => state.captiveIds);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const isOverlay = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';

  const layerFilter = useMemo(() => {
    const ids = child ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];
    return child ? filterBase : (['!', filterBase] as FilterSpecification);
  }, [shatterIds, child]);

  const layerOpacity = useMemo(
    () =>
      isOverlay
        ? 0.4
        : getLayerFill(captiveIds, child ? shatterIds.children : shatterIds.parents, child, true),
    [captiveIds, shatterIds, child, isOverlay]
  );

  if (!id || !mapDocument) return null;

  return (
    <>
      <Layer
        id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography'}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': layerOpacity,
          'fill-color': [
            'case',
            ['boolean', ['feature-state', 'hasColor'], false],
            ['feature-state', 'color'],
            '#808080',
          ],
        }}
      />
      {!isOverlay && (
        <Layer
          id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography_hover'}
          source={BLOCK_SOURCE_ID}
          source-layer={id}
          filter={child ? layerFilter : ['literal', true]}
          beforeId={LABELS_BREAK_LAYER_ID}
          type="fill"
          layout={{
            visibility: 'visible',
          }}
          paint={{
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.25, 0],
            'fill-color': '#000000',
          }}
        />
      )}
      <Layer
        id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_demography_line'}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="line"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0.2],
          'line-color': '#000000',
          'line-width': 1,
        }}
      />
    </>
  );
};

export const ZoneLayerGroup: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const shatterIds = useMapStore(state => state.shatterIds);
  const captiveIds = useMapStore(state => state.captiveIds);
  const id = child ? mapDocument?.child_layer : mapDocument?.parent_layer;
  const highlightUnassigned = useMapStore(state => state.mapOptions.higlightUnassigned);
  const showPaintedDistricts = useMapStore(state => state.mapOptions.showPaintedDistricts);
  const isOverlayed = useMapStore(state => state.mapOptions.showDemographicMap) === 'overlay';
  const layerFilter = useMemo(() => {
    const ids = child ? shatterIds.children : shatterIds.parents;
    const cleanIds = Boolean(ids) ? Array.from(ids) : [];
    const filterBase: FilterSpecification = ['in', ['get', 'path'], ['literal', cleanIds]];
    return child ? filterBase : (['!', filterBase] as FilterSpecification);
  }, [shatterIds, child]);

  const lineWidth = child ? 1 : 2;

  const layerOpacity = useMemo(
    () =>
      getLayerFill(
        captiveIds,
        child ? shatterIds.children : shatterIds.parents,
        child,
        isOverlayed
      ),
    [captiveIds, shatterIds, child, isOverlayed]
  );

  if (!id || !mapDocument) return null;
  return (
    <>
      <Layer
        id={child ? BLOCK_LAYER_ID_CHILD : BLOCK_LAYER_ID}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={layerFilter}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="line"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'line-opacity': 0.8,
          // 'line-color': '#aaaaaa', // Default color
          'line-color': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            6,
            '#aaa',
            9,
            '#777',
            14,
            '#333',
          ],
          'line-width': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            6,
            lineWidth * 0.125,
            9,
            lineWidth * 0.35,
            14,
            lineWidth,
          ],
        }}
      />
      <Layer
        id={child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: showPaintedDistricts ? 'visible' : 'none',
        }}
        paint={{
          'fill-opacity': layerOpacity,
          'fill-color': ZONE_ASSIGNMENT_STYLE || '#000000',
        }}
      />
      <Layer
        id={(child ? BLOCK_HOVER_LAYER_ID_CHILD : BLOCK_HOVER_LAYER_ID) + '_hover'}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: 'visible',
        }}
        paint={{
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.25, 0],
          'fill-color': '#000000',
        }}
      />
      <Layer
        id={child ? BLOCK_LAYER_ID_HIGHLIGHT_CHILD : BLOCK_LAYER_ID_HIGHLIGHT}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        type="line"
        layout={{
          visibility: showPaintedDistricts ? 'visible' : 'none',
          'line-cap': 'round',
        }}
        paint={{
          'line-opacity': 1,
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'focused'], false],
            '#000000', // Black color when focused
            ['boolean', ['feature-state', 'highlighted'], false],
            '#e5ff00', // yellow color when highlighted
            ['boolean', ['feature-state', 'highlighted'], false],
            '#e5ff00', // yellow color when highlighted
            // @ts-ignore right behavior, wrong types
            ['==', ['feature-state', 'zone'], null],
            '#FF0000', // optionally red color when zone is not assigned
            '#000000', // Default color
          ],
          'line-width': [
            'case',
            [
              'any',
              ['boolean', ['feature-state', 'focused'], false],
              ['boolean', ['feature-state', 'highlighted'], false],
              [
                'all',
                // @ts-ignore correct logic, wrong types
                ['==', ['feature-state', 'zone'], null],
                ['boolean', !!highlightUnassigned],
                ['!', ['boolean', ['feature-state', 'broken'], false]],
              ],
            ],
            3.5,
            0, // Default width if none of the conditions are met
          ],
        }}
      />
    </>
  );
};
