import {
  BLOCK_HOVER_LAYER_ID,
  BLOCK_LAYER_ID_HIGHLIGHT,
  BLOCK_SOURCE_ID,
  getLayerFill,
  ZONE_ASSIGNMENT_STYLE,
} from '@/app/constants/layers';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useMemo} from 'react';
import {Layer} from 'react-map-gl/maplibre';
import {useColorScheme} from '@/app/hooks/useColorScheme';

export default function ZoneParentLayerGroup({layerBeforeId}: {layerBeforeId: string}) {
  const colorScheme = useColorScheme();
  const mapDocument = useMapStore(state => state.mapDocument);
  const captiveIds = useMapStore(state => state.captiveIds);
  const id = mapDocument?.parent_layer;
  const highlightUnassigned = useMapControlsStore(state => state.mapOptions.higlightUnassigned);
  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const isOverlayed =
    useMapControlsStore(state => state.mapOptions.showDemographicMap) === 'overlay';

  const layerOpacity = useMemo(
    () => getLayerFill(captiveIds, false, isOverlayed),
    [captiveIds, isOverlayed]
  );

  if (!id || !mapDocument) return null;
  return (
    <>
      <Layer
        id={BLOCK_LAYER_ID_HIGHLIGHT}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={['literal', true]}
        beforeId={layerBeforeId}
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
      <Layer
        id={BLOCK_HOVER_LAYER_ID}
        source={BLOCK_SOURCE_ID}
        source-layer={id}
        filter={['literal', true]}
        beforeId={BLOCK_LAYER_ID_HIGHLIGHT}
        type="fill"
        layout={{
          visibility: showPaintedDistricts ? 'visible' : 'none',
        }}
        paint={{
          'fill-opacity': layerOpacity,
          'fill-color': ZONE_ASSIGNMENT_STYLE(colorScheme) || '#000000',
        }}
      />
    </>
  );
}
