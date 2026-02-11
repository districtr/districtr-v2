import { Box, Flex, Button, Slider, Text, Switch } from '@radix-ui/themes';
import { MaskOffIcon } from '@radix-ui/react-icons';
import { useMapControlsStore } from '@store/mapControlsStore';
import { useAssignmentsStore } from '@store/assignmentsStore';
import { useMapStore } from '@store/mapStore';
import { useFeatureFlagStore } from '@store/featureFlagStore';
import { useOverlayStore } from '@/app/store/overlayStore';
import { BrushSizeSelector } from '@components/Toolbar/ToolControls/BrushSizeSelector';
import PaintByCounty from '@components/Toolbar/PaintByCounty';
import PaintCommunity from '@components/Toolbar/PaintCommunity';
import { communityAssignments } from '@utils/community/communityAssignments';
import { CommunityControls } from '@components/Toolbar/CommunityControls';
import { ZonePicker } from '@components/Toolbar/ZonePicker';

export const BrushControls = () => {
  const activeTool = useMapControlsStore(state => state.activeTool);
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const paintCommunity = useMapControlsStore(state => state.mapOptions.paintCommunity);
  const paintConstraint = useOverlayStore(state => state.paintConstraint);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);

  const showPaintedDistricts = useMapControlsStore(state => state.mapOptions.showPaintedDistricts);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const isReadOnly = access === 'read';
  const showCommunities = useMapControlsStore(state => state.mapOptions.showCommunities);
  const communityList = useMapControlsStore(state => state.communityList);
  const communityOpacity = useMapControlsStore(state => state.mapOptions.communityOpacity);
  const communityMaxOpacity = useMapControlsStore(state => state.mapOptions.communityMaxOpacity);
  const hasCommunities = useMapControlsStore(state => state.communityList.length > 0);

  return (
    <Flex direction="column" gapY="2" justify="between" wrap="wrap">
      <Flex direction="row" gapX="4" wrap="wrap">
        <Box className="flex-grow" style={{ flexGrow: 1 }}>
          <BrushSizeSelector />
        </Box>
        {paintCounties && (
          <Box minWidth="75px">
            <PaintByCounty />{' '}
          </Box>
        )}
      </Flex>
      {activeTool === 'brush' ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          {paintCommunity ? <CommunityControls mode="brush" /> : <ZonePicker />}
        </div>
      ) : null}

      {activeTool === 'eraser' && paintCommunity ? (
        <div className="flex-grow-0 flex-row p-0 m-0">
          <CommunityControls mode="erase" />
        </div>
      ) : null}

      {paintConstraint && (
        <Button variant="outline" color="orange" onClick={clearPaintConstraint}>
          <Flex justify="between" align="center" gap="2">
            <Text size="2">Release paint mask</Text>
            <MaskOffIcon />
          </Flex>
        </Button>
      )}

      <Flex gap="3" align="center" wrap="wrap">
        <Box minWidth="95px">
          <PaintCommunity />
        </Box>
        {!paintCommunity && hasCommunities ? (
          <Text as="label" size="1">
            <Flex gap="1" direction="column" justify="center">
              <Flex justify="center">
                <Switch
                  size="1"
                  checked={showCommunities}
                  defaultChecked={false}
                  onClick={() => setMapOptions({ showCommunities: !showCommunities })}
                  disabled={isReadOnly}
                />
                {''}
              </Flex>
              <Text size="1"> Show Communities </Text>
            </Flex>
          </Text>
        ) : null}
        {paintCommunity ? (
          <Text as="label" size="1">
            <Flex gap="1" direction="column" justify="center">
              <Flex justify="center">
                <Switch
                  size="1"
                  checked={showPaintedDistricts}
                  defaultChecked={false}
                  onClick={() => setMapOptions({ showPaintedDistricts: !showPaintedDistricts })}
                  disabled={isReadOnly}
                />
                {''}
              </Flex>
              <Text size="1"> Show Districts </Text>
            </Flex>
          </Text>
        ) : null}
        {paintCommunity ? (
          <Box className="flex-1 min-w-[180px]">
            <Flex direction="column" gap="1" width="100%">
              <Slider
                style={{ marginTop: 4 }}
                size="2"
                value={[communityOpacity]}
                min={0.1}
                max={communityMaxOpacity}
                step={0.01}
                onValueChange={values => {
                  const value = values.length ? values[0] : 1;
                  setMapOptions({
                    communityOpacity: Math.min(communityMaxOpacity, Math.max(0, value)),
                  });

                  const geoids = Array.from(
                    new Set(
                      communityList.flatMap(c =>
                        communityAssignments.getGeoidsForCommunity(c.id, true)
                      )
                    )
                  );
                  const { queueCommunityGeoids, flushCommunityAssignments } =
                    useAssignmentsStore.getState();
                  queueCommunityGeoids(geoids);
                  flushCommunityAssignments();
                  useMapStore.getState().getMapRef()?.triggerRepaint();
                }}
                disabled={isReadOnly}
              />

              <Flex width="100%" justify="center" align="center">
                <Text size="1" style={{ marginTop: -1 }}>
                  Community Opacity
                </Text>
              </Flex>
            </Flex>
          </Box>
        ) : null}
      </Flex>
    </Flex>
  );
};
