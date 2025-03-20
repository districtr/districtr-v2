import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_HOVER_LAYER_ID_CHILD,
  BLOCK_LAYER_ID,
  BLOCK_LAYER_ID_CHILD,
  BLOCK_LAYER_ID_HIGHLIGHT,
  BLOCK_LAYER_ID_HIGHLIGHT_CHILD,
  getLayerFill,
  LABELS_BREAK_LAYER_ID,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {FilterSpecification} from 'maplibre-gl';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';


export const ZoneLayerGroup: React.FC<{
  child?: boolean;
}> = ({child = false}) => {
  const colorScheme = useMapStore(state => state.colorScheme);
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
        source={id}
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
        source={id}
        source-layer={id}
        filter={child ? layerFilter : ['literal', true]}
        beforeId={LABELS_BREAK_LAYER_ID}
        type="fill"
        layout={{
          visibility: showPaintedDistricts ? 'visible' : 'none',
        }}
        paint={{
          'fill-opacity': layerOpacity,
          'fill-color': ZONE_ASSIGNMENT_STYLE(colorScheme) || '#000000',
        }}
      />
      <Layer
        id={child ? BLOCK_LAYER_ID_HIGHLIGHT_CHILD : BLOCK_LAYER_ID_HIGHLIGHT}
        source={id}
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
