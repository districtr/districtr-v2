import {useMapStore} from '@/app/store/mapStore';
import {getContiguity} from '@/app/utils/api/apiHandlers/getContiguity';
import {Blockquote, Box, Flex, Table, Text} from '@radix-ui/themes';
import {useQuery} from '@tanstack/react-query';
import {queryClient} from '@utils/api/queryClient';
import {useEffect, useMemo, useState} from 'react';
import {CheckCircledIcon, DashIcon} from '@radix-ui/react-icons';
import {FALLBACK_NUM_DISTRICTS} from '@/app/constants/layers';
import {isAxiosError} from 'axios';
import {RefreshButton, TimestampDisplay} from '@/app/components/Time/TimestampDisplay';
import ZoomToConnectedComponents from './ZoomToConnectedComponents';

export const Contiguity = () => {
  const mapDocument = useMapStore(store => store.mapDocument);
  const colorScheme = useMapStore(store => store.colorScheme);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const {data, error, isLoading, isFetched, refetch} = useQuery(
    {
      queryKey: ['Contiguity', mapDocument?.document_id],
      queryFn: () => mapDocument && getContiguity(mapDocument),
      enabled: !!mapDocument,
      staleTime: 0,
      retry: false,
      placeholderData: previousData => previousData,
    },
    queryClient
  );

  const update = async () => {
    setLastUpdated(null);
    await refetch();
    setLastUpdated(new Date().toLocaleString());
  };

  useEffect(() => {
    setLastUpdated(new Date().toLocaleString());
  }, [isFetched]);

  const tableData = useMemo(() => {
    if (!data) return [];
    const cleanData: any = [];
    const numDistricts = mapDocument?.num_districts ?? FALLBACK_NUM_DISTRICTS;
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
    if (isAxiosError(error)) {
      return <Blockquote color="red">{error.response?.data?.detail || error.message}</Blockquote>;
    } else {
      return <Blockquote color="red">{error.message}</Blockquote>;
    }
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
                      backgroundColor: colorScheme[(row.zone - 1) % colorScheme.length],
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
                  <ZoomToConnectedComponents
                    zone={row.zone}
                    contiguity={row.contiguity}
                    updateTrigger={lastUpdated}
                    handleUpdateParent={update}
                  />
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
      <Flex direction="row" gapX="4" pt="4" align="center">
        <RefreshButton onClick={update} />
        <TimestampDisplay timestamp={lastUpdated} />
      </Flex>
    </Box>
  );
};
