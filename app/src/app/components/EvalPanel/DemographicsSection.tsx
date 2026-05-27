'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useMapStore} from '@store/mapStore';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

interface Props {
  evaluation: DocumentEvaluation;
}

const GROUP_LABELS: Record<string, string> = {
  white: 'White (any part)',
  h: 'Hispanic / Latino',
  b: 'Black',
  asian_nhpi: 'Asian / NHPI',
  amin: 'American Indian',
};

const GROUP_ORDER = ['white', 'h', 'b', 'asian_nhpi', 'amin'];

function DistrictBadges({zones}: {zones: number[]}) {
  const getZoneColor = useZoneColorGetter();
  if (!zones.length) return <Text size="2">—</Text>;
  return (
    <Flex gap="1" wrap="wrap" justify="end">
      {zones.map(zone => (
        <Flex
          key={zone}
          align="center"
          justify="center"
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: getZoneColor(zone),
            flexShrink: 0,
          }}
        >
          <Text size="1" style={{color: '#fff', fontWeight: 600, lineHeight: 1}}>
            {zone}
          </Text>
        </Flex>
      ))}
    </Flex>
  );
}

export function DemographicsSection({evaluation}: Props) {
  const majorityDistricts = evaluation.majority_districts;
  const numDistricts = useMapStore(state => state.mapDocument?.num_districts ?? 0);

  if (!majorityDistricts) return null;

  const rows = GROUP_ORDER.filter(key => key in majorityDistricts).map(key => ({
    key,
    label: GROUP_LABELS[key] ?? key,
    districts: majorityDistricts[key as keyof typeof majorityDistricts] ?? [],
  }));

  if (!rows.length) return null;

  return (
    <Accordion.Root type="single" collapsible defaultValue="demographics">
      <Accordion.Item value="demographics">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">Demographic Majority Districts</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          <Text size="2" mb="3" as="p">
            For each demographic group, this table reports the number of districts in which that
            group forms a majority of the total population. Fine-grained population shares by
            district are available in the editor&apos;s <em>Demographics</em> panel.
          </Text>

          <Table.Root size="1">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Group</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Majority in</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Of total</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell justify="end">Districts</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {rows.map(({key, label, districts}) => (
                <Table.Row key={key}>
                  <Table.Cell>
                    <Text size="2">{label}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2">{districts.length}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <Text size="2">{districts.length} / {numDistricts}</Text>
                  </Table.Cell>
                  <Table.Cell justify="end">
                    <DistrictBadges zones={districts} />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
