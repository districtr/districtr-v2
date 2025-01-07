import {useMapStore} from '@/app/store/mapStore';
import {Assignment} from '@/app/utils/api/apiHandlers';
import {document as createDocument} from '@/app/utils/api/mutations';
import {ClipboardCopyIcon, ClipboardIcon, FileIcon} from '@radix-ui/react-icons';
import {Button, Flex, Heading, Popover, TextArea} from '@radix-ui/themes';
import {useState} from 'react';

export const ZoneImportExport = () => {
  const zoneAssignments = useMapStore(state => state.zoneAssignments);
  const shatterMappings = useMapStore(state => state.shatterMappings);
  const mapDocument = useMapStore(state => state.mapDocument);
  const loadZoneAssignments = useMapStore(state => state.loadZoneAssignments);
  const setAppLoadingState = useMapStore(state => state.setAppLoadingState);
  const [textContent, setTextContent] = useState('');

  const exportToJSON = (format: 'clipboard' | 'file') => {
    let formattedData: Record<string, Partial<Assignment>> = {};
    const zoneAssignmentEntries = Array.from(zoneAssignments.entries());
    for (const [key, value] of zoneAssignmentEntries) {
      formattedData[key] = {
        geo_id: key,
        zone: value as any,
      };
    }
    for (const [key, children] of Object.entries(shatterMappings)) {
      children.forEach(child => {
        if (formattedData[child]) {
          formattedData[child].parent_path = key;
        }
      });
    }

    const formattedOutput = {
      zones: Object.values(formattedData),
      gerryDbTable: mapDocument?.gerrydb_table,
    };

    switch (format) {
      case 'clipboard':
        navigator.clipboard.writeText(JSON.stringify(formattedOutput, null, 2));
        break;
      case 'file':
        const today = new Date().toISOString().split('T')[0];
        const blob = new Blob([JSON.stringify(formattedOutput, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `zone assignments districtr ${today}.json`;
        a.click();
        break;
    }
  };

  const loadFromJson = (json: string) => {
    const parsed = JSON.parse(json);
    createDocument.mutate({gerrydb_table: parsed.gerryDbTable});
    const unsub = useMapStore.subscribe(
      state => state.assignmentsHash,
      hash => {
        if (hash) {
          unsub();
          setAppLoadingState('loaded')
          loadZoneAssignments(parsed.zones, false)
        }
      }
    );
  };

  return (
    <Flex direction={'column'} gap="2" my="4">
      <Heading as="h3" size="3">
        Export your map
      </Heading>
      <Flex direction="row" gap="2">
        <Button onClick={() => exportToJSON('clipboard')} variant="outline">
          <ClipboardIcon />
          Copy to clipboard
        </Button>
        <Button onClick={() => exportToJSON('file')} variant="outline">
          <FileIcon />
          Download as JSON
        </Button>
      </Flex>

      <Heading as="h3" size="3">
        Load your map
      </Heading>
      <Flex direction="row" gap="2">
        <Popover.Root>
          <Popover.Trigger>
            <Button variant="outline" aria-label="Paste map data">
              <ClipboardCopyIcon />
              Paste map data
            </Button>
          </Popover.Trigger>
          <Popover.Content width="360px">
            <Flex gap="3" direction="column">
              <TextArea
                style={{width: '100%', height: '100px'}}
                placeholder="Paste your map data here"
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
              />
              <Button onClick={() => loadFromJson(textContent)} variant="outline" aria-label='Load map data from pasted JSON'>
                Load map data
              </Button>
            </Flex>
          </Popover.Content>
        </Popover.Root>
        <Button onClick={() => exportToJSON('file')} variant="outline" disabled>
          <FileIcon />
          Load file
        </Button>
      </Flex>
    </Flex>
  );
};
