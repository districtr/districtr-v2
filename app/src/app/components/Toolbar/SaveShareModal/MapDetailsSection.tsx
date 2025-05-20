import {DocumentMetadata} from '@/app/utils/api/apiHandlers/types';
import {Box, Flex, Grid, Heading, Text, TextArea, TextField} from '@radix-ui/themes';
import {MapStatusButtons} from '../../Topbar/MapStatus';

export const MapDetailsSection: React.FC<{
  mapMetadata: DocumentMetadata;
  onChange: (updates: Partial<DocumentMetadata>) => any;
  isEditing: boolean;
}> = ({mapMetadata, onChange, isEditing}) => {
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
    </Flex>
  );
};
