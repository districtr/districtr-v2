import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {Box, Button, Flex, Grid, Heading, Text, TextArea, TextField} from '@radix-ui/themes';
import {MapStatusButtons} from '../../Topbar/MapStatus';
import * as Accordion from '@radix-ui/react-accordion';
import {useState} from 'react';
import {ChevronDownIcon, ChevronUpIcon} from '@radix-ui/react-icons';

export const MapDetailsSection: React.FC<{
  mapMetadata: DocumentMetadata;
  onChange: (updates: Partial<DocumentMetadata>) => any;
  isEditing: boolean;
}> = ({mapMetadata, onChange, isEditing}) => {
  const [accordionOpen, setAccordionOpen] = useState<string>('');
  return (
    <Flex direction="column" gap="2">
      <Heading as="h3" size="5">
        Map details
      </Heading>
      <Box>
        <Text>Name</Text>
        <TextField.Root
          className="flex-1 w-full"
          value={mapMetadata.name ?? ''}
          placeholder="Map name"
          onChange={e => onChange({name: e.target.value})}
          disabled={!isEditing}
        />
      </Box>
      <Box>
        <Text>Status</Text>
        <Flex
          direction="row"
          gap="2"
          className={!isEditing ? 'opacity-50 pointer-events-none' : ''}
        >
          <MapStatusButtons
            draftStatus={mapMetadata.draft_status}
            onChange={status => onChange({draft_status: status})}
          />
        </Flex>
      </Box>
      <Accordion.Root
        type="single"
        collapsible
        value={accordionOpen}
        onValueChange={value => setAccordionOpen(value)}
      >
        <Accordion.Item value="group">
          <Accordion.AccordionTrigger className="AccordionTrigger w-full mt-2">
            <Button className="w-full" variant="ghost">
              <Flex direction="row" gap="2" align="center" justify="start" className="w-full">
                <Text>Advanced</Text>
                {accordionOpen === 'group' ? <ChevronUpIcon /> : <ChevronDownIcon />}
              </Flex>
            </Button>
          </Accordion.AccordionTrigger>
          <Accordion.AccordionContent className="AccordionContent">
            <Grid columns="2" gap="2">
              <Box>
                <Text>Group</Text>
                <TextField.Root
                  className="flex-1 w-full"
                  value={mapMetadata.group ?? ''}
                  placeholder="Group"
                  disabled={!isEditing}
                  onChange={e => onChange({group: e.target.value})}
                />
              </Box>
              <Box>
                <Text>Tags (coming soon)</Text>
                <TextField.Root
                  className="flex-1 w-full"
                  value={mapMetadata.tags ?? ''}
                  placeholder="Tags"
                  disabled={true}
                />
              </Box>
            </Grid>
            <Box>
              <Text>Comments</Text>
              <TextArea
                className="flex-1 w-full"
                value={mapMetadata.description ?? ''}
                placeholder="Comments or description"
                onChange={e => onChange({description: e.target.value})}
                disabled={!isEditing}
              />
            </Box>
          </Accordion.AccordionContent>
        </Accordion.Item>
      </Accordion.Root>
    </Flex>
  );
};
