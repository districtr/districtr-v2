'use client';
import type React from 'react';
import {BLOCK_SOURCE_ID} from '@/app/constants/layers';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {useMapStore} from '@/app/store/mapStore';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {useLayoutEffect} from 'react';
import {useMap} from 'react-map-gl/maplibre';

export const DemographyColorController: React.FC<{enabled: boolean}> = ({enabled}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const demographicVariable = useDemographyStore(state => state.variable);
  const demographicVariant = useDemographyStore(state => state.variant);
  const setScale = useDemographyStore(state => state.setScale);
  const demographyDataHash = useDemographyStore(state => state.dataHash);
  const numberOfBins = useDemographyStore(state => state.numberOfBins);
  const shatterIds = useAssignmentsStore(state => state.shatterIds);
  const mapRef = useMap();

  useLayoutEffect(() => {
    if (!enabled || !mapDocument) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const paintDemography = () => {
      const mapScale = demographyCache.calculateDemographyColorScale({
        variable: demographicVariable,
        variant: demographicVariant,
        mapRef: map,
        mapDocument,
        numberOfBins: numberOfBins || 5,
        paintMap: true,
      });
      if (mapScale) {
        setScale(mapScale);
      }
      return mapScale;
    };

    if (map.getSource(BLOCK_SOURCE_ID)) {
      paintDemography();
      return;
    }

    const handleLoad = () => {
      const painted = paintDemography();
      if (painted) {
        map.off('load', handleLoad);
      }
    };
    map.on('load', handleLoad);

    return () => {
      map.off('load', handleLoad);
    };
  }, [
    enabled,
    numberOfBins,
    demographicVariable,
    demographyDataHash,
    shatterIds,
    mapDocument,
    demographicVariant,
    mapRef,
    setScale,
  ]);

  return null;
};
