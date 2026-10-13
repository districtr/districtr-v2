import {Card, Checkbox, Flex, Text} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useOverlayStore} from '@/app/store/overlayStore';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {useUiHintStore, useGuideTarget} from '@/app/store/uiHintStore';
import {useFeatureFlagStore} from '@/app/store/featureFlagStore';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {demographyService} from '@/app/utils/demography/demographyService';
import {getFeaturesInBbox} from '@utils/map/getFeaturesInBbox';
import {getFeaturesIntersectingCounties} from '@utils/map/getFeaturesIntersectingCounties';
import {ACCESS_STATES} from '@constants/document/state';
import {ACTIVE_TOOLS} from '@constants/map/tools';
import {HelpTip, HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

// Connecticut's TIGER county layer (tl_2023_us_county) reflects its 2022
// switch to planning regions as county-equivalents, but districtr's own block
// geoids still carry the legacy county FIPS codes — the two never match, so
// county brush can never find any blocks under a "county" queried from that
// layer there. Disabled outright rather than left to spansMultipleCounties(),
// which has no way to see this mismatch.
const CONNECTICUT_STATE_FIPS = '09';

/** Whether county painting can work on this map at all: LOCAL maps (flag
 * off), Connecticut (see above), and single-county maps can't. Exported for
 * DraftStatusHelper's rough-draw hint. */
export const useCountyPaintAvailable = (): boolean => {
  const paintCounties = useFeatureFlagStore(state => state.paintCounties);
  const statefps = useMapStore(state => state.mapDocument?.statefps);
  // Re-render when demography data (re)loads.
  const dataHash = useDemographyStore(state => state.dataHash);
  const isConnecticut = statefps?.length === 1 && statefps[0] === CONNECTICUT_STATE_FIPS;
  const isSingleCounty = !isConnecticut && !!dataHash && !demographyService.spansMultipleCounties();
  return paintCounties && !isConnecticut && !isSingleCounty;
};

export default function PaintByCounty() {
  const mapRef = useMapStore(state => state.getMapRef());
  const setPaintFunction = useMapControlsStore(state => state.setPaintFunction);
  const paintByCounty = useMapControlsStore(state => state.mapOptions.paintByCounty);
  const setMapOptions = useMapControlsStore(state => state.setMapOptions);
  const access = useMapStore(state => state.mapStatus?.access);
  const clearPaintConstraint = useOverlayStore(state => state.clearPaintConstraint);
  const activeTool = useMapControlsStore(state => state.activeTool);
  const inBlockView = useMapStore(state => state.captiveIds.size > 0);
  // County Brush is one of the "basic tools" now — it shares the same combined
  // demonstration as pan/paint/erase(/break/inspector) instead of its own.
  const superDraw = useToolbarStore(state => state.superDraw);
  const combinationHelpKey = superDraw ? 'superdrawToolsCombination' : 'drawToolsCombination';
  // Break picks one unit and block-scale painting has no counties to paint by.
  // Toggling here would also swap the break tool's single-feature selector for
  // the county one, so the next break click would shatter the whole county.
  // handleShatter turns the brush off on entry; this keeps it off until exit.
  const lockedForBreak = activeTool === ACTIVE_TOOLS.SHATTER || inBlockView;
  // Pan doesn't paint at all — same as the brush-size slider and zone picker,
  // just visually/functionally inert, no explanatory tooltip needed.
  const disabledForPan = activeTool === ACTIVE_TOOLS.PAN;
  const disabledForGeography = !useCountyPaintAvailable();
  const disabled =
    access === ACCESS_STATES.READ || lockedForBreak || disabledForPan || disabledForGeography;
  // Already on counts as satisfied — a click would turn it off.
  const {guiding, flashing} = useGuideTarget('county-brush', paintByCounty);
  const advanceGuide = useUiHintStore(state => state.advanceGuide);

  const handleToggle = () => {
    advanceGuide('county-brush');
    if (!mapRef) return;
    setMapOptions({
      paintByCounty: !paintByCounty,
    });
    if (!paintByCounty) {
      // Clear overlay constraint when enabling county paint
      clearPaintConstraint();
      setPaintFunction(getFeaturesIntersectingCounties);
    } else {
      setPaintFunction(getFeaturesInBbox);
    }
  };

  const disabledReasonText = lockedForBreak
    ? 'Unavailable while breaking a unit into blocks'
    : disabledForGeography
      ? 'Unavailable for this map'
      : '';

  return (
    <HelpTip
      tip={combinationHelpKey}
      openDelay={HELP_TIP_HOVER_DELAY}
      text={disabledReasonText}
      hideLink={lockedForBreak || disabledForGeography}
    >
      <Card
        size="1"
        className={`${paintByCounty ? 'bg-indigo-50' : ''} ${
          guiding ? 'ui-guide' : flashing ? 'ui-flash' : ''
        }`}
        style={
          lockedForBreak || disabledForPan || disabledForGeography ? {opacity: 0.5} : undefined
        }
      >
        <Text as="label" size="2" className="cursor-pointer select-none">
          <Flex gap="2" align="center">
            <Checkbox checked={paintByCounty} onCheckedChange={handleToggle} disabled={disabled} />
            Paint by county
          </Flex>
        </Text>
      </Card>
    </HelpTip>
  );
}
