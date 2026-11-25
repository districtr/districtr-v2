'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import '@utils/map/maplibreWorker';
import * as maplibregl from 'maplibre-gl';
import type {ExpressionSpecification} from 'maplibre-gl';
import {Protocol} from 'pmtiles';
import React, {useEffect, useMemo, useState} from 'react';
import GlMap, {type MapEvent, type ViewState} from 'react-map-gl/maplibre';
import {Box, Flex, Grid, Spinner, Text} from '@radix-ui/themes';
import {BASEMAP_IDS, ZONE_ASSIGNMENT_STYLE} from '@constants/map/layerStyle';
import {getMapStyleForBasemap} from '@constants/map/viewDefaults';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import {extendColorArray} from '@utils/colors';
import {TILESET_URL} from '@utils/api/constants';
import {getAssignments} from '@utils/api/apiHandlers/getAssignments';
import {idb} from '@utils/idb/idb';
import type {Assignment, DocumentObject} from '@utils/api/apiHandlers/types';
import type {SyncConflictInfo} from '@utils/api/apiHandlers/fetchDocument';

const SOURCE_ID = 'conflict-preview';
const ASSIGNED: ExpressionSpecification = ['!=', ['feature-state', 'zone'], null];

const PreviewMap: React.FC<{
  document: DocumentObject;
  assignments: Assignment[];
  viewState?: ViewState;
  onMove: (viewState: ViewState) => void;
}> = ({document, assignments, viewState, onMove}) => {
  const colors = useMemo(() => {
    const scheme = document.color_scheme ?? DefaultColorScheme;
    return extendColorArray(scheme, Math.max(scheme.length, document.num_districts ?? 0));
  }, [document.color_scheme, document.num_districts]);

  const onLoad = ({target: map}: MapEvent) => {
    // Below the basemap's labels, so place names stay readable.
    const beforeId = map.getStyle().layers.find(layer => layer.type === 'symbol')?.id;
    map.addSource(SOURCE_ID, {
      type: 'vector',
      url: `pmtiles://${TILESET_URL}/${document.tiles_s3_path}`,
      promoteId: 'path',
    });
    // Unassigned parents get a faint gray; children draw only where assigned
    // (i.e. inside broken-down parents), on top of their gray parent.
    const layers: Array<[string | null, ExpressionSpecification]> = [
      [document.parent_layer, ['case', ASSIGNED, 0.8, 0.25]],
      [document.child_layer, ['case', ASSIGNED, 0.8, 0]],
    ];
    for (const [sourceLayer, opacity] of layers) {
      if (!sourceLayer) continue;
      map.addLayer(
        {
          id: `${SOURCE_ID}-${sourceLayer}`,
          type: 'fill',
          source: SOURCE_ID,
          'source-layer': sourceLayer,
          paint: {'fill-color': ZONE_ASSIGNMENT_STYLE(colors), 'fill-opacity': opacity},
        },
        beforeId
      );
    }
    // ponytail: community maps can overlap; the last community listed for a unit wins here.
    for (const {geo_id, zone, parent_path} of assignments) {
      const sourceLayer = parent_path ? document.child_layer : document.parent_layer;
      if (zone == null || !sourceLayer) continue;
      map.setFeatureState({source: SOURCE_ID, sourceLayer, id: geo_id}, {zone});
    }
  };

  return (
    <Box className="h-[320px] rounded overflow-hidden border border-gray-300">
      <GlMap
        {...viewState}
        initialViewState={{bounds: document.extent, fitBoundsOptions: {padding: 10}}}
        onMove={e => onMove(e.viewState)}
        onLoad={onLoad}
        mapStyle={getMapStyleForBasemap(BASEMAP_IDS.MINIMAL)}
        dragRotate={false}
        pitchWithRotate={false}
        attributionControl={{compact: true}}
      />
    </Box>
  );
};

/** The local (IDB) and cloud versions of a conflicted plan, as two maps that pan and zoom together. */
export const ConflictMapPreview: React.FC<{conflict: SyncConflictInfo}> = ({conflict}) => {
  const {localDocument, serverDocument} = conflict;
  const [versions, setVersions] = useState<{local: Assignment[]; server: Assignment[]}>();
  const [error, setError] = useState(false);
  const [viewState, setViewState] = useState<ViewState>();

  useEffect(() => {
    // MainMap registers this too; never removed here, so closing the preview can't
    // pull the protocol out from under the main map.
    maplibregl.addProtocol('pmtiles', new Protocol().tile);
    let cancelled = false;
    Promise.all([idb.getDocument(localDocument.document_id), getAssignments(serverDocument)])
      .then(([local, server]) => {
        if (cancelled) return;
        if (!local || !server.ok) return setError(true);
        setVersions({local: local.assignments, server: server.response});
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [localDocument.document_id, serverDocument]);

  if (error) {
    return (
      <Text size="2" color="red" className="block mb-4">
        Couldn&apos;t load both versions to compare. You can still choose below.
      </Text>
    );
  }
  if (!versions) {
    return (
      <Flex justify="center" align="center" className="h-[320px] mb-4">
        <Spinner />
      </Flex>
    );
  }
  return (
    <Grid columns="2" gap="3" className="mb-4">
      <PreviewMap
        document={localDocument}
        assignments={versions.local}
        viewState={viewState}
        onMove={setViewState}
      />
      <PreviewMap
        document={serverDocument}
        assignments={versions.server}
        viewState={viewState}
        onMove={setViewState}
      />
    </Grid>
  );
};
