import {Flex, Text} from '@radix-ui/themes';
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  MinusCircledIcon,
} from '@radix-ui/react-icons';
import {useQuery} from '@tanstack/react-query';
import {useMapStore} from '@/app/store/mapStore';
import {Contiguity} from './Contiguity';
import {ZoomToUnassigned} from './ZoomToUnassigned';
import {useEffect, useState} from 'react';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useSummaryStats} from '@/app/hooks/useSummaryStats';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useUnassignedFeatures} from '@/app/hooks/useUnassignedFeatures';
import {useUiHintStore, type ValidationTab} from '@/app/store/uiHintStore';
import {getContiguity} from '@utils/api/apiHandlers/getContiguity';
import {formatNumber} from '@utils/numbers';
import {NUMBER_FORMATS} from '@constants/demography/format';
import {FALLBACK_NUM_DISTRICTS} from '@constants/document/limits';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';
import {ACCESS_STATES} from '@constants/document/state';
import {Expander} from '../AnimatedCollapse';

type CheckStatus = 'pass' | 'fail' | 'unknown';

/** Expander header: check-result icon + title + one-line result preview, so
 * the outcome reads without opening the panel. */
const CheckHeader: React.FC<{title: string; status: CheckStatus; detail: string}> = ({
  title,
  status,
  detail,
}) => {
  const Icon =
    status === 'pass' ? CheckCircledIcon : status === 'fail' ? CrossCircledIcon : MinusCircledIcon;
  const color =
    status === 'pass' ? 'var(--green-9)' : status === 'fail' ? 'var(--red-9)' : 'var(--gray-8)';
  return (
    <Flex align="center" gap="2" py="1">
      <Icon style={{color, flexShrink: 0}} width={18} height={18} />
      <Flex direction="column" align="start">
        <Text size="2" weight="medium">
          {title}
        </Text>
        <Text size="1" color="gray" className="font-normal">
          {detail}
        </Text>
      </Flex>
    </Flex>
  );
};

export const MapValidation = () => {
  const mapMode = useMapControlsStore(state => state.mapMode);
  const setNotification = useMapStore(state => state.setNotification);
  const [openPanels, setOpenPanels] = useState<Record<ValidationTab, boolean>>({
    Contiguity: false,
    Completeness: false,
  });
  const togglePanel = (panel: ValidationTab) =>
    setOpenPanels(prev => ({...prev, [panel]: !prev[panel]}));
  // Guided step (see uiHintStore.guideTargets): helper-box hints point at a
  // validation panel and pulse its header until the user opens it themselves.
  // A panel that's already open needs no click — advance past it with a
  // one-shot confirmation pulse instead.
  const guideTarget = useUiHintStore(state => state.guideTargets[0]);
  const advanceGuide = useUiHintStore(state => state.advanceGuide);
  const flash = useUiHintStore(state => state.flash);
  const flashTarget = useUiHintStore(state => state.flashTarget);
  const guidedPanel: ValidationTab | null =
    guideTarget === 'validation:Contiguity'
      ? 'Contiguity'
      : guideTarget === 'validation:Completeness'
        ? 'Completeness'
        : null;
  useEffect(() => {
    if (guidedPanel && openPanels[guidedPanel]) {
      advanceGuide(`validation:${guidedPanel}`);
      flash(`validation:${guidedPanel}`);
    }
  }, [guidedPanel, openPanels, advanceGuide, flash]);
  const panelHintClass = (panel: ValidationTab) =>
    guidedPanel === panel ? 'ui-guide' : flashTarget === `validation:${panel}` ? 'ui-flash' : '';
  const mapDocument = useMapStore(state => state.mapDocument);
  const idbDocument = useIdbDocument(mapDocument?.document_id);
  const access = useMapStore(state => state.mapStatus?.access);
  // Only editors save (or are told to): a read-only viewer with a stale local
  // timestamp must not fire writes — or conflict UI — on their behalf.
  const canSave = access === ACCESS_STATES.EDIT;
  const isOutdated =
    canSave && idbDocument?.clientLastUpdated !== idbDocument?.document_metadata.updated_at;
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);

  // Opening the check (or expanding a panel) silently saves pending edits so
  // the results reflect the current map — helper-box jumps land on fresh
  // numbers, without the map-lock overlay or saved toast (this also runs when
  // the Stats tab merely opens with the section expanded). Also keyed on the
  // IDB document's arrival: it loads async, so the mount-time run sees
  // isOutdated=false and would otherwise miss the opening save. Deliberately
  // not keyed on isOutdated itself: painting while the panel is open must not
  // trigger a save per stroke.
  const idbLoaded = !!idbDocument;
  useEffect(() => {
    if (isOutdated) handlePutAssignments(false, {silent: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanels.Contiguity, openPanels.Completeness, idbLoaded]);

  // Completeness preview: unassigned population is always known; the area
  // count appears once the (mount- or save-triggered) area search has run.
  const {summaryStats} = useSummaryStats();
  const unassigned = summaryStats?.unassigned;
  // Observe-only: the preview reports whatever the Completeness panel's search
  // found, without kicking off geometry work of its own just to render a line.
  const {features: unassignedFeatures, hasResult: hasFoundUnassigned} = useUnassignedFeatures({
    observeOnly: true,
  });
  const numUnassignedAreas = unassignedFeatures.length;
  // Areas lead: the count of places to go fix is the actionable half, the
  // population the detail.
  const areasPrefix = `${numUnassignedAreas} unassigned area${
    numUnassignedAreas === 1 ? '' : 's'
  } · `;
  const completenessStatus: CheckStatus =
    unassigned === undefined ? 'unknown' : unassigned === 0 ? 'pass' : 'fail';
  // The area count is omitted on a failing check unless areas were actually
  // found: a fully blank map has millions unassigned but no discrete areas,
  // and "· 0 unassigned areas" next to that number reads as a contradiction.
  const completenessDetail =
    unassigned === undefined
      ? 'Not checked yet'
      : unassigned === 0
        ? `${hasFoundUnassigned ? areasPrefix : ''}All population assigned`
        : `${
            hasFoundUnassigned && numUnassignedAreas > 0 ? areasPrefix : ''
          }${formatNumber(unassigned, NUMBER_FORMATS.STRING)} population unassigned`;

  // Contiguity preview: shares the cache entry of the Contiguity panel and
  // the draft-status helper (same key), so no extra requests once either has
  // fetched; keying on updated_at refreshes it per save.
  const {data: contiguityData} = useQuery({
    queryKey: ['Contiguity', mapDocument?.document_id, mapDocument?.updated_at],
    queryFn: async () => await getContiguity(mapDocument),
    enabled: !!mapDocument,
    staleTime: Infinity,
    retry: false,
    placeholderData: previousData => previousData,
    refetchOnWindowFocus: false,
  });
  const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
  const pieceCounts =
    contiguityData?.ok === true
      ? Object.values(contiguityData.response).filter((p): p is number => typeof p === 'number')
      : undefined;
  const brokenDistricts = pieceCounts?.filter(pieces => pieces > 1).length ?? 0;
  const contiguousDistricts = pieceCounts?.filter(pieces => pieces === 1).length ?? 0;
  const unstartedDistricts = numDistricts - brokenDistricts - contiguousDistricts;
  const contiguityStatus: CheckStatus = !pieceCounts
    ? 'unknown'
    : brokenDistricts > 0
      ? 'fail'
      : contiguousDistricts >= numDistricts
        ? 'pass'
        : 'unknown';
  const contiguityDetail = !pieceCounts
    ? 'Not checked yet'
    : brokenDistricts > 0
      ? `${brokenDistricts} district${brokenDistricts === 1 ? '' : 's'} split into components`
      : contiguousDistricts >= numDistricts
        ? 'All districts in one component'
        : `${unstartedDistricts} district${unstartedDistricts === 1 ? '' : 's'} not started`;

  useEffect(() => {
    if (mapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI) {
      setNotification({
        message: 'Map validation is not available for community maps.',
        importance: 2,
        type: 'error',
      });
    }
  }, [mapDocument?.map_type, mapMode, setNotification]);

  if (mapDocument?.map_type === MAP_TYPES.COMMUNITY || mapMode === MAP_MODES.COI) {
    return null;
  }

  return (
    <Flex direction="column" gap="2">
      {isOutdated && (
        // Compact single-row staleness note: noticeable (amber, icon) without
        // the old full-alarm red callout — opening the panel already
        // auto-saves, so this mostly covers the brief in-flight window.
        <Flex
          align="center"
          gap="2"
          p="2"
          style={{
            background: 'var(--amber-2)',
            border: '1px solid var(--amber-6)',
            borderRadius: 6,
          }}
        >
          <ExclamationTriangleIcon style={{color: 'var(--amber-9)', flexShrink: 0}} />
          <Text size="2">
            Results are from your last save.{' '}
            <button
              type="button"
              onClick={() => handlePutAssignments(false, {silent: true})}
              className="inline cursor-pointer whitespace-nowrap font-semibold text-districtrBlue hover:underline underline-offset-2"
            >
              Save now →
            </button>
          </Text>
        </Flex>
      )}
      <Expander
        open={openPanels.Completeness}
        onToggle={() => togglePanel('Completeness')}
        buttonClassName={`h-auto ${panelHintClass('Completeness')}`}
        label={
          <CheckHeader
            title="Completeness"
            status={completenessStatus}
            detail={completenessDetail}
          />
        }
      >
        <ZoomToUnassigned />
      </Expander>
      <Expander
        open={openPanels.Contiguity}
        onToggle={() => togglePanel('Contiguity')}
        buttonClassName={`h-auto ${panelHintClass('Contiguity')}`}
        label={
          <CheckHeader title="Contiguity" status={contiguityStatus} detail={contiguityDetail} />
        }
      >
        <Contiguity />
      </Expander>
    </Flex>
  );
};
