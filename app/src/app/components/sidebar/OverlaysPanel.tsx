'use client';
import {Button, Flex, Text, Switch, Separator} from '@radix-ui/themes';
import {MaskOffIcon, MaskOnIcon} from '@radix-ui/react-icons';
import {getMaskOverlayId, useOverlayStore} from '@/app/store/overlayStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {fastUniqBy} from '@/app/utils/arrays';
import {useMemo} from 'react';
import {useMapStore} from '@/app/store/mapStore';
import {COUNTY_SOURCE_ID} from '@/app/constants/map/layerIds';
import type {Overlay} from '@/app/utils/api/apiHandlers/types';
import {OverlayMetadataModal, isLegislativeOverlay} from './OverlayMetadataModal';
import {useIsSingleCounty} from '@/app/hooks/useIsSingleCounty';
import {HelpTip} from '@/app/components/HelpTip/HelpTip';

/** Masks painting to one area of a boundary layer, showing only that layer
 * while masking; while armed or masked it cancels/releases instead. */
const MaskButton = ({layerId}: {layerId: string}) => {
  const masked = useOverlayStore(state => state.paintConstraint?.overlayId === layerId);
  const selecting = useOverlayStore(state => state.selectingLayerId === layerId);
  const selectOverlayFeature = useOverlayStore(state => state.selectOverlayFeature);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  return (
    <HelpTip tip="paintMask">
      <Button
        onClick={() =>
          masked || selecting ? clearPaintConstraint() : selectOverlayFeature(layerId)
        }
        variant={masked ? 'solid' : 'soft'}
        size="1"
        className="cursor-pointer"
      >
        {masked ? <MaskOffIcon /> : <MaskOnIcon />}
        {masked ? 'Unmask' : selecting ? 'Cancel' : 'Mask'}
      </Button>
    </HelpTip>
  );
};

export const OverlaysPanel = () => {
  const availableOverlays = useMapStore(state => state.mapDocument?.overlays ?? []);
  const enabledOverlayIds = useOverlayStore(state => state.enabledOverlayIds);
  const toggleOverlay = useOverlayStore(state => state.toggleOverlay);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const mapOptions = useMapControlsStore(state => state.mapOptions);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const isSingleCounty = useIsSingleCounty();
  // Paint-mask creation is a Super Draw feature (releasing stays available).
  const superDraw = useToolbarStore(state => state.superDraw);

  // We want an easy way to make implicit map overlay groups, like outlines and labels.
  // We could make a construct to manage groupings of overlays, but that's a pain.
  // Instead, we just assume overlays with exactly the same name are part of the same group.
  // If admins want separately toggle-able overlays, don't name them the same.
  const overlaysGroupedByName = useMemo(() => {
    const sortedOverlays = availableOverlays.sort((a, b) => {
      if (a.name === b.name) {
        return a.layer_type.localeCompare(b.layer_type);
      }
      return a.name.localeCompare(b.name);
    });
    return fastUniqBy(sortedOverlays, 'name');
  }, [availableOverlays]);

  const legislativeOverlays = overlaysGroupedByName.filter(isLegislativeOverlay);
  const otherOverlays = overlaysGroupedByName.filter(o => !isLegislativeOverlay(o));

  const renderOverlayRow = (overlay: Overlay) => {
    const maskOverlayId = getMaskOverlayId(availableOverlays, overlay.name);
    return (
      <Flex key={overlay.overlay_id} justify="between" align="center" gap="2">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            {overlay.name}
          </Text>
          {overlay.description && (
            <Text size="1" color="gray">
              {overlay.description}
            </Text>
          )}
        </Flex>
        <Flex direction="row" gap="2" align="center" justify="center">
          <Switch
            checked={enabledOverlayIds.has(overlay.name)}
            onCheckedChange={() => toggleOverlay(overlay.name)}
          />
          {superDraw && maskOverlayId && <MaskButton layerId={maskOverlayId} />}
        </Flex>
      </Flex>
    );
  };

  return (
    <Flex gap="3" direction="column">
      <Flex justify="end" align="center">
        <OverlayMetadataModal />
      </Flex>
      {/* Congressional + state legislative districts, grouped under a heading */}
      {legislativeOverlays.length > 0 && (
        <>
          <Text size="2" weight="bold">
            Legislative Districts
          </Text>
          {legislativeOverlays.map(renderOverlayRow)}
          <Separator size="4" />
        </>
      )}

      {/* County Layer Controls - shown as pseudo-overlay on multi-county maps */}
      {!isSingleCounty && (
        <Flex justify="between" align="center" gap="2">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Counties
            </Text>
            <Text size="1" color="gray">
              Show county boundaries and labels
            </Text>
          </Flex>
          <Flex direction="row" gap="2" align="center" justify="center">
            <Switch
              checked={mapOptions.showCountyBoundaries ?? false}
              onCheckedChange={checked => {
                // Release (or stop arming) the county paint mask when its layer
                // is hidden. First: releasing restores the pre-mask layers.
                const {paintConstraint, selectingLayerId} = useOverlayStore.getState();
                if (
                  !checked &&
                  (paintConstraint?.overlayId ?? selectingLayerId) === COUNTY_SOURCE_ID
                ) {
                  clearPaintConstraint();
                }
                setMapOptions({
                  showCountyBoundaries: checked,
                  prominentCountyNames: checked,
                });
                useOverlayStore.getState().setCountyLinesAfterMask(checked);
              }}
            />
            {superDraw && <MaskButton layerId={COUNTY_SOURCE_ID} />}
          </Flex>
        </Flex>
      )}

      {/* Remaining boundaries (metro areas, school districts, tribal areas) */}
      {otherOverlays.map(renderOverlayRow)}

      {isSingleCounty && !legislativeOverlays.length && !otherOverlays.length && (
        <Text size="2" color="gray">
          No boundaries available for this map
        </Text>
      )}
    </Flex>
  );
};

export default OverlaysPanel;
