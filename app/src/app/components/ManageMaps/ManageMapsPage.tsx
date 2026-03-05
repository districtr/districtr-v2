'use client';

import React from 'react';
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Heading,
  Link,
  Select,
  Separator,
  Table,
  Text,
  TextField,
} from '@radix-ui/themes';
import {ExclamationTriangleIcon, MagnifyingGlassIcon} from '@radix-ui/react-icons';
import {useRouter} from 'next/navigation';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';
import {useUserMaps} from '@/app/hooks/useUserMaps';
import {idb} from '@/app/utils/idb/idb';

const UNKNOWN_MODULE = 'Unknown module';

const getMapName = (map: DocumentObject) => map.map_metadata?.name || map.districtr_map_slug;
const getMapModule = (map: DocumentObject) => map.map_module || UNKNOWN_MODULE;

const isSafariBrowser = (userAgent: string) => {
  return (
    /Safari\//.test(userAgent) &&
    !/Chrome\//.test(userAgent) &&
    !/CriOS\//.test(userAgent) &&
    !/FxiOS\//.test(userAgent) &&
    !/EdgiOS\//.test(userAgent) &&
    !/OPiOS\//.test(userAgent) &&
    !/Android/.test(userAgent)
  );
};

export const ManageMapsPage: React.FC = () => {
  const router = useRouter();
  const [updateTrigger, setUpdateTrigger] = React.useState<number>(Date.now());
  const [textFilter, setTextFilter] = React.useState('');
  const [moduleFilter, setModuleFilter] = React.useState('all');
  const [isSafari, setIsSafari] = React.useState(false);
  const recentMaps = useUserMaps(updateTrigger);

  React.useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsSafari(isSafariBrowser(navigator.userAgent));
    }
  }, []);

  const moduleOptions = React.useMemo(() => {
    const modules = Array.from(new Set(recentMaps.map(getMapModule)));
    return modules.sort((a, b) => a.localeCompare(b));
  }, [recentMaps]);

  const filteredMaps = React.useMemo(() => {
    const normalizedText = textFilter.trim().toLowerCase();
    return recentMaps.filter(map => {
      const name = getMapName(map).toLowerCase();
      const module = getMapModule(map);
      const moduleMatches = moduleFilter === 'all' || module === moduleFilter;
      const textMatches =
        !normalizedText ||
        name.includes(normalizedText) ||
        map.districtr_map_slug.toLowerCase().includes(normalizedText) ||
        module.toLowerCase().includes(normalizedText);
      return moduleMatches && textMatches;
    });
  }, [recentMaps, textFilter, moduleFilter]);

  const handleDeleteMap = async (documentId: string) => {
    const confirmed = window.confirm(
      'Remove this map from local browser storage? This cannot be undone.'
    );
    if (!confirmed) return;
    await idb.deleteDocument(documentId);
    setUpdateTrigger(Date.now());
  };

  const clearFilters = () => {
    setTextFilter('');
    setModuleFilter('all');
  };

  return (
    <Flex direction="column" gap="5">
      <Box>
        <Heading size="7" as="h1">
          Manage Maps
        </Heading>
        <Text size="3" color="gray">
          Browse and manage maps saved in this browser.
        </Text>
      </Box>

      <Callout.Root color="amber" size="2">
        <Callout.Icon>
          <ExclamationTriangleIcon />
        </Callout.Icon>
        <Callout.Text>
          Saved maps on this page are local to this browser and device. Clearing browser cache or
          site data can permanently remove them.
        </Callout.Text>
      </Callout.Root>

      {isSafari && (
        <Callout.Root color="ruby" size="2">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            <b>Safari users:</b> if you do not use Districtr for 7 days, Safari may clear local
            data and your maps may be lost. We recommend using Chrome, Firefox, or Edge for better
            persistence.
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex
        gap="4"
        align={{
          initial: 'start',
          md: 'end',
        }}
        direction={{
          initial: 'column',
          md: 'row',
        }}
      >
        <Box className="w-full md:flex-1">
          <Text as="label" size="2" weight="medium">
            Text filter
          </Text>
          <TextField.Root
            value={textFilter}
            onChange={event => setTextFilter(event.target.value)}
            placeholder="Filter by map name, slug, or module"
          >
            <TextField.Slot>
              <MagnifyingGlassIcon />
            </TextField.Slot>
          </TextField.Root>
        </Box>
        <Box className="w-full md:w-[260px]">
          <Text as="label" size="2" weight="medium">
            Map module
          </Text>
          <Select.Root value={moduleFilter} onValueChange={setModuleFilter}>
            <Select.Trigger placeholder="All modules" />
            <Select.Content>
              <Select.Item value="all">All modules</Select.Item>
              {moduleOptions.map(module => (
                <Select.Item key={module} value={module}>
                  {module}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Box>
      </Flex>

      <Flex justify="between" align="center">
        <Text size="2" color="gray">
          Showing {filteredMaps.length} of {recentMaps.length} saved map
          {recentMaps.length === 1 ? '' : 's'}
        </Text>
        {(textFilter || moduleFilter !== 'all') && (
          <Button variant="soft" color="gray" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </Flex>

      <Separator size="4" />

      {!recentMaps.length && (
        <Flex
          direction="column"
          gap="2"
          className="rounded-lg border border-dashed border-gray-300 p-5 bg-gray-50"
        >
          <Heading size="4">No local maps found</Heading>
          <Text size="2" color="gray">
            Start a new map, then return here to manage local saved maps.
          </Text>
          <Box>
            <Link href="/map">Go to mapping app</Link>
          </Box>
        </Flex>
      )}

      {!!recentMaps.length && !filteredMaps.length && (
        <Flex
          direction="column"
          gap="2"
          className="rounded-lg border border-dashed border-gray-300 p-5 bg-gray-50"
        >
          <Heading size="4">No maps match your filters</Heading>
          <Text size="2" color="gray">
            Try changing the text or module filters.
          </Text>
        </Flex>
      )}

      {!!filteredMaps.length && (
        <Box className="overflow-x-auto">
          <Table.Root size="2" variant="surface">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Map</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Module</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last updated</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {filteredMaps.map(map => (
                <Table.Row key={map.document_id}>
                  <Table.Cell>
                    <Flex direction="column" gap="1">
                      <Text weight="bold">{getMapName(map)}</Text>
                      <Text size="1" color="gray">
                        {map.districtr_map_slug}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge variant="soft">{getMapModule(map)}</Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Text>{new Date(map.updated_at).toLocaleString()}</Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2" justify="end">
                      <Button onClick={() => router.push(`/map/edit/${map.document_id}`)} size="1">
                        Open
                      </Button>
                      <Button
                        variant="soft"
                        color="ruby"
                        size="1"
                        onClick={() => handleDeleteMap(map.document_id)}
                      >
                        Remove
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Box>
      )}
    </Flex>
  );
};
