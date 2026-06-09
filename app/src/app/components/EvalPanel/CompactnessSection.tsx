'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {useMemo} from 'react';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

// Scores computed on EPSG:5070 (NAD83 / Conus Albers) via gerrytools.
// All three districts are from the 2020 redistricting cycle.
const AL1 = {
  name: "Alabama's 1st Congressional District",
  polsby_popper: 0.1536,
  reock: 0.2091,
  image: '/al_district1.png',
};
const OK5 = {
  name: "Oklahoma's 5th Congressional District",
  polsby_popper: 0.3419,
  reock: 0.4993,
  image: '/ok_district5.png',
};
const CO5 = {
  name: "Colorado's 5th Congressional District",
  polsby_popper: 0.5589,
  reock: 0.5459,
  image: '/co_district5.png',
};

interface Props {
  evaluation: DocumentEvaluation;
}

const EXEMPLARS = [AL1, OK5, CO5];

const SCORE_LABEL: Record<'polsby_popper' | 'reock', string> = {
  polsby_popper: 'A Polsby-Popper score of',
  reock: 'A Reock score of',
};

interface ExemplarTableProps {
  scoreKey: 'polsby_popper' | 'reock';
}

const ExemplarTable: React.FC<ExemplarTableProps> = ({scoreKey}) => {
  return (
    <Table.Root size="1" mb="3">
      <Table.Body>
        <Table.Row>
          <Table.RowHeaderCell>
            <Text size="1">{SCORE_LABEL[scoreKey]}</Text>
          </Table.RowHeaderCell>
          {EXEMPLARS.map(e => (
            <Table.Cell key={e.name} justify="center">
              <Text size="2">{e[scoreKey].toFixed(3)}</Text>
            </Table.Cell>
          ))}
        </Table.Row>
        <Table.Row>
          <Table.RowHeaderCell style={{verticalAlign: 'middle'}}>
            <Text size="1">...is exemplified by...</Text>
          </Table.RowHeaderCell>
          {EXEMPLARS.map(e => (
            <Table.Cell key={e.name} justify="center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.image} alt={e.name} style={{width: 100, height: 100, objectFit: 'contain', display: 'block', margin: '0 auto'}} />
            </Table.Cell>
          ))}
        </Table.Row>
        <Table.Row>
          <Table.RowHeaderCell>
            <Text size="1">Source</Text>
          </Table.RowHeaderCell>
          {EXEMPLARS.map(e => (
            <Table.Cell key={e.name} justify="center">
              <Text size="1">{e.name}</Text>
            </Table.Cell>
          ))}
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
}

export const CompactnessSection: React.FC<Props> = ({evaluation}) => {
  const {cut_edges, polsby_popper, reock} = evaluation;
  const getZoneColor = useZoneColorGetter();
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
  const zones = useMemo(
    () => polsby_popper ? Object.keys(polsby_popper).sort((a, b) => Number(a) - Number(b)) : [],
    [polsby_popper]
  );

  const ppStats = useMemo(() => {
    if (!polsby_popper) return null;
    const vals = Object.values(polsby_popper).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return {min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length};
  }, [polsby_popper]);

  const reockStats = useMemo(() => {
    if (!reock) return null;
    const vals = Object.values(reock).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return {min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((a, b) => a + b, 0) / vals.length};
  }, [reock]);

  return (
    <Accordion.Root type="single" collapsible defaultValue="compactness">
      <Accordion.Item value="compactness">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">Compactness</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>

          {/* Cut Edges */}
          <Heading size="2" align="center" mb="2" mt="4">Cut Edges</Heading>
          {cut_edges ? (
            <>
              <Text size="2" mb="2" as="p">
                Your plan has{' '}
                <strong>{cut_edges.cut_count.toLocaleString()}</strong> cut edges between{' '}
                {cut_edges.unit_type}s.
              </Text>
              <Text size="2" as="p">
                One measurement of compactness is the number of <strong>cut edges</strong> in a
                districting plan. This counts the number of adjacent {cut_edges.unit_type}s that
                are separated into different districts. You should only compare cut edge counts
                between plans for the same state using the same units — a lower number means a more
                compact plan.
              </Text>
            </>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}

          {/* Polsby-Popper */}
          <Heading size="2" align="center" mb="2" mt="4">Polsby-Popper Scores</Heading>
          <Text size="2" as="p" mb="2">
            The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
            perimeter. Scores range from 0 to 1; higher scores indicate more compact districts.
            Unlike cut edges, this measure depends on map projection and boundary resolution rather
            than the choice of geographic units.
          </Text>
          <ExemplarTable scoreKey="polsby_popper" />
          {ppStats && (
            <Text size="2" as="p" mb="3">
              In your plan, scores range from <strong>{ppStats.min.toFixed(3)}</strong> to{' '}
              <strong>{ppStats.max.toFixed(3)}</strong>, with a mean of <strong>{ppStats.mean.toFixed(3)}</strong>.
            </Text>
          )}

          {/* Reock */}
          <Heading size="2" align="center" mb="2" mt="4">Reock Scores</Heading>
          <Text size="2" as="p" mb="2">
            The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of
            the smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1;
            higher scores indicate more compact, circular districts. Reock is sensitive to map
            projection and is computed on-demand when the evaluation view is opened.
          </Text>
          <ExemplarTable scoreKey="reock" />
          {reockStats && (
            <Text size="2" as="p" mb="3">
              In your plan, scores range from <strong>{reockStats.min.toFixed(3)}</strong> to{' '}
              <strong>{reockStats.max.toFixed(3)}</strong>, with a mean of <strong>{reockStats.mean.toFixed(3)}</strong>.
            </Text>
          )}

          {/* Per-district detail */}
          {polsby_popper && (
            <>
              <Text size="1" className="uppercase tracking-widest" mb="1" as="p">
                Per-district scores
              </Text>
              <Table.Root size="1">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>District</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Polsby-Popper</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">Reock</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {zones.map(zone => (
                    <Table.Row key={zone} onMouseEnter={() => onDistrictEnter(zone)} onMouseLeave={onDistrictLeave} style={{cursor: 'default'}}>
                      <Table.Cell>
                        <Flex align="center" gap="2">
                          <div style={{width: 16, height: 16, borderRadius: '50%', backgroundColor: getZoneColor(Number(zone)), flexShrink: 0}} />
                          <Text size="2">{zone}</Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatNumber(polsby_popper[zone], NUMBER_FORMATS.DECIMAL_3)}</Text>
                      </Table.Cell>
                      <Table.Cell justify="end">
                        <Text size="2">{formatNumber((reock ?? {})[zone], NUMBER_FORMATS.DECIMAL_3)}</Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </>
          )}

        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
