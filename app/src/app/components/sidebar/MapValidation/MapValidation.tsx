import {Flex, SegmentedControl, Text} from '@radix-ui/themes';
import {ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {Contiguity} from './Contiguity';
import {ZoomToUnassigned} from './ZoomToUnassigned';
import {useEffect, useState} from 'react';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {useUiHintStore} from '@/app/store/uiHintStore';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';
import {ACCESS_STATES} from '@constants/document/state';

const mapValidationPanel = [
  {
    label: 'Contiguity',
    component: <Contiguity />,
  },
  {
    label: 'Completeness',
    component: <ZoomToUnassigned />,
  },
];
export const MapValidation = () => {
  const mapType = useMapStore(state => state.mapDocument?.map_type);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const setNotification = useMapStore(state => state.setNotification);
  const [activePanel, setActivePanel] = useState(
    mapValidationPanel[mapType === MAP_TYPES.LOCAL ? 1 : 0].label
  );
  // Helper-box hints jump straight to a validation panel; consuming at mount
  // is deliberate here — the jump usually mounts this component.
  const validationTabRequest = useUiHintStore(state => state.requests.validationTab);
  const clearRequest = useUiHintStore(state => state.clear);
  useEffect(() => {
    if (validationTabRequest) {
      setActivePanel(validationTabRequest);
      clearRequest('validationTab');
    }
  }, [validationTabRequest, clearRequest]);
  const Component = mapValidationPanel.find(panel => panel.label === activePanel)?.component;
  const mapDocument = useMapStore(state => state.mapDocument);
  const idbDocument = useIdbDocument(mapDocument?.document_id);
  const access = useMapStore(state => state.mapStatus?.access);
  // Only editors save (or are told to): a read-only viewer with a stale local
  // timestamp must not fire writes — or conflict UI — on their behalf.
  const canSave = access === ACCESS_STATES.EDIT;
  const isOutdated =
    canSave && idbDocument?.clientLastUpdated !== idbDocument?.document_metadata.updated_at;
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);

  // Opening the check (or swapping panels) silently saves pending edits so
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
  }, [activePanel, idbLoaded]);

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
      {/* Segmented control to match the Table | Map sub-section tabs. */}
      <SegmentedControl.Root size="2" value={activePanel} onValueChange={setActivePanel}>
        {mapValidationPanel.map((panel, index) => (
          <SegmentedControl.Item key={index} value={panel.label}>
            {panel.label}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>

      {!!Component && Component}
    </Flex>
  );
};
