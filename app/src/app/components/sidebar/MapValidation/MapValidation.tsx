import {Button, Callout, Flex, SegmentedControl, Text} from '@radix-ui/themes';
import {ExclamationTriangleIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {Contiguity} from './Contiguity';
import {ZoomToUnassigned} from './ZoomToUnassigned';
import {useEffect, useState} from 'react';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {CloudNotSavedIcon} from '../../Topbar/Icons';
import {MAP_MODES} from '@constants/map/mode';
import {MAP_TYPES} from '@constants/document/types';

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
  const Component = mapValidationPanel.find(panel => panel.label === activePanel)?.component;
  const mapDocument = useMapStore(state => state.mapDocument);
  const idbDocument = useIdbDocument(mapDocument?.document_id);
  const isOutdated = idbDocument?.clientLastUpdated !== idbDocument?.document_metadata.updated_at;
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);

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
        <Callout.Root color="red" role="alert">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text size="3" weight="medium">
            You have unsaved changes — results below are from your last save.
          </Callout.Text>
          <Button onClick={() => handlePutAssignments()} color="red" className="cursor-pointer">
            <Flex direction="row" gap="2" align="center" justify="center">
              <CloudNotSavedIcon />
              <Text>Save changes to update</Text>
            </Flex>
          </Button>
        </Callout.Root>
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
