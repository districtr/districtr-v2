import {useMapStore} from '@/app/store/mapStore';
import {getContiguity} from '@/app/utils/api/apiHandlers';
import {Box, Button, Flex, Table, Text} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {useMemo} from 'react';

export const Contiguity = () => {
  const mapDocument = useMapStore(store => store.mapDocument);
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
  const lastUpdated = useMemo(() => {
    if (data) {
      return new Date().toLocaleString();
    }
    return 'N/A';
  }, [data]);

  const tableData = useMemo(() => {
    console.log("Updating contiguity", data)
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
  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <Box>
      <Table.Root size="3">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell pl=".5rem">Zone</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell>Contiguity</Table.ColumnHeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {tableData.map((row: any, i: number) => (
            <Table.Row key={i}>
              <Table.Cell pl=".5rem">{row.zone}</Table.Cell>
              <Table.Cell pl=".5rem">
                {row.contiguity === null
                  ? 'Zone not started'
                  : row.contiguity == true
                    ? 'Contiguous'
                    : 'Not Contiguous'}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex direction="row" gapX="2" pt="4" align="center" >
        <Button onClick={() => refetch()}>Refresh</Button>
        <Text>{lastUpdated}</Text>
      </Flex>
    </Box>
  );
};
