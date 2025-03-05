import {useMapStore} from '@/app/store/mapStore';
import {getContiguity} from '@/app/utils/api/apiHandlers';
import {Blockquote, Box, Button, Flex, Table, Text} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {useMemo, useState} from 'react';
import {CheckCircledIcon, CrossCircledIcon, DashIcon} from '@radix-ui/react-icons';
import {colorScheme} from '@/app/constants/colors';

export const Contiguity = () => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const [lastUpdated, setLastUpdated] = useState<string|null>(null);
  const {data, error, isLoading, refetch} = useQuery(
    {
      queryKey: ['Contiguity', mapDocument?.document_id],
      queryFn: () => mapDocument && getContiguity(mapDocument),
      enabled: !!mapDocument,
      staleTime: 0,
      placeholderData: previousData => previousData,
    },
    queryClient
  );

  const update = () => {
    refetch();
    setLastUpdated(new Date().toLocaleString());
  }

  const tableData = useMemo(() => {
    console.log('Updating contiguity', data);
    if (!data) return [];
    const cleanData: any = [];
    const numDistricts = mapDocument?.num_districts ?? 4;
    for (let i = 1; i < numDistricts + 1; i++) {
      if (i in data) {
        cleanData.push({
          zone: i,
          contiguity: data[i],
        });
      } else {
        cleanData.push({
          zone: i,
          contiguity: null,
        });
      }
    }
    return cleanData;
  }, [data]);
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (error || data?.detail) {
    return <Blockquote color="red">Error: {error?.message || data?.detail}</Blockquote>;
  }

  return (
    <Box>
      <Table.Root size="1">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell>
              <Text>Zone</Text>
            </Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Contiguity</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {tableData.map((row: any, i: number) => (
            <Table.Row key={i}>
              <Table.Cell>
                <Flex align="center" gap="2">
                  <div
                    style={{
                      width: '15px',
                      height: '15px',
                      backgroundColor: colorScheme[(row.zone % colorScheme.length) - 1],
                      borderRadius: '4px',
                    }}
                  />
                  <Text weight="bold">{row.zone}</Text>
                </Flex>
              </Table.Cell>
              <Table.Cell>
                {row.contiguity === null ? (
                  <DashIcon color="gray" />
                ) : row.contiguity == 1 ? (
                  <CheckCircledIcon color="green" />
                ) : (
                  <Flex direction="row" gap="1">
                    <CrossCircledIcon color="red" />
                    <Text color="gray">{row.contiguity} connected components</Text>
                  </Flex>
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex direction="row" gapX="4" pt="4" align="center">
        <Button onClick={update}>Refresh</Button>
        {!!lastUpdated && <Text>{lastUpdated}</Text>}
      </Flex>
    </Box>
  );
};
