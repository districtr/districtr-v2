import {Blockquote, Button, Flex, Text, Tabs} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {Contiguity} from './Contiguity';
import {ZoomToUnassigned} from './ZoomToUnassigned';
import {useState} from 'react';
import {useIdbDocument} from '@/app/hooks/useIdbDocument';
import {useAssignmentsStore} from '@/app/store/assignmentsStore';
import {CloudNotSavedIcon} from '../../Topbar/Icons';

const mapValidationPanel = [
  {
    label: 'Contiguity',
    component: <Contiguity />,
  },
  {
    label: 'Unassigned Areas',
    component: <ZoomToUnassigned />,
  },
];
export const MapValidation = () => {
  const mapType = useMapStore(state => state.mapDocument?.map_type);
  const [activePanel, setActivePanel] = useState(
    mapValidationPanel[mapType === 'local' ? 1 : 0].label
  );
  const Component = mapValidationPanel.find(panel => panel.label === activePanel)?.component;
  const mapDocument = useMapStore(state => state.mapDocument);
  const idbDocument = useIdbDocument(mapDocument?.document_id);
  const isOutdated = idbDocument?.clientLastUpdated !== idbDocument?.document_metadata.updated_at;
  const handlePutAssignments = useAssignmentsStore(state => state.handlePutAssignments);

  return (
    <Flex direction="column" gap="2">
      {isOutdated && (
        <>
          <Blockquote size="2" color="red">
            <Text>
              Map validation requires that your plan be saved to the cloud. Displaying results for
              your last save.
            </Text>
            <br />
            <br />
            <Button onClick={() => handlePutAssignments()} variant="outline">
              <Flex direction="row" gap="2" align="center" justify="center">
                <CloudNotSavedIcon />
                <Text>Save Changes</Text>
              </Flex>
            </Button>
          </Blockquote>
        </>
      )}
      <Tabs.Root value={activePanel} onValueChange={setActivePanel}>
        <Tabs.List justify={'start'}>
          {mapValidationPanel.map((panel, index) => (
            <Tabs.Trigger key={index} value={panel.label} className="text-center">
              {panel.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      {!!Component && Component}
    </Flex>
  );
};
