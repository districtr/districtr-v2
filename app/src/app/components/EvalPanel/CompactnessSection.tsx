'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {useMemo} from 'react';
import {Flex, Text, Table, Heading} from '@radix-ui/themes';
import {DistrictLabel} from './DistrictLabel';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {formatNumber} from '@/app/utils/numbers';
import {NUMBER_FORMATS} from '@/app/constants/demography/format';

import {useZoomToDistrict} from '@/app/hooks/useZoomToDistrict';

// Scores computed on EPSG:5070 (NAD83 / Conus Albers) via gerrytools.
// All three districts are from the 2020 redistricting cycle.
const AL1 = {
  name: "Alabama's 1st Congressional District",
  polsby_popper: 0.1536,
  image: '/al_district1.png',
};
const OK5 = {
  name: "Oklahoma's 5th Congressional District",
  polsby_popper: 0.3419,
  image: '/ok_district5.png',
};
const CO5 = {
  name: "Colorado's 5th Congressional District",
  polsby_popper: 0.5589,
  image: '/co_district5.png',
};

const AL2 = {
  name: "Alabama's 2nd Congressional District",
  reock: 0.2238,
  image: '/al_district2.png',
};
const OK2 = {
  name: "Oklahoma's 2nd Congressional District",
  reock: 0.4371,
  image: '/ok_district2.png',
};
const CO2 = {
  name: "Colorado's 2nd Congressional District",
  reock: 0.6577,
  image: '/co_district2.png',
};

interface CompactnessSectionProps {
  evaluation: DocumentEvaluation;
}

interface Exemplar {
  name: string;
  image: string;
  polsby_popper?: number;
  reock?: number;
}

const PP_exemplars: Exemplar[] = [AL1, OK5, CO5];
const REOCK_exemplars: Exemplar[] = [AL2, OK2, CO2];

const SCORE_LABEL: Record<'polsby_popper' | 'reock', string> = {
  polsby_popper: 'A Polsby-Popper score of',
  reock: 'A Reock score of',
};

interface ExemplarTableProps {
  scoreKey: 'polsby_popper' | 'reock';
  exemplars: Exemplar[];
}

const ExemplarTable: React.FC<ExemplarTableProps> = ({scoreKey, exemplars}) => {
  return (
    <Table.Root size="1" mb="3">
      <Table.Body>
        <Table.Row>
          <Table.Cell justify="center">
            <Text size="1">{SCORE_LABEL[scoreKey]}</Text>
          </Table.Cell>
          {exemplars.map(e => (
            <Table.Cell key={e.name} justify="center">
              <Text size="2">{e[scoreKey]?.toFixed(3) ?? '—'}</Text>
            </Table.Cell>
          ))}
        </Table.Row>
        <Table.Row>
          <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
            <Text size="1">...is exemplified by...</Text>
          </Table.Cell>
          {exemplars.map(e => (
            <Table.Cell key={e.name} justify="center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.image}
                alt={e.name}
                style={{
                  width: 100,
                  height: 100,
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto',
                }}
              />
            </Table.Cell>
          ))}
        </Table.Row>
        <Table.Row>
          <Table.Cell justify="center">
            <Text size="1">Source</Text>
          </Table.Cell>
          {exemplars.map(e => (
            <Table.Cell key={e.name} justify="center">
              <Text size="1">{e.name}</Text>
            </Table.Cell>
          ))}
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
};

export const CompactnessSection: React.FC<CompactnessSectionProps> = ({evaluation}) => {
  const {cut_edges, polsby_popper, reock} = evaluation;
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
  const zoomToDistrict = useZoomToDistrict();
  const zones = useMemo(
    () => (polsby_popper ? Object.keys(polsby_popper).sort((a, b) => Number(a) - Number(b)) : []),
    [polsby_popper]
  );

  const ppStats = useMemo(() => {
    if (!polsby_popper) return null;
    const vals = Object.values(polsby_popper).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }, [polsby_popper]);

  const reockStats = useMemo(() => {
    if (!reock) return null;
    const vals = Object.values(reock).filter(v => !isNaN(v));
    if (!vals.length) return null;
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    };
  }, [reock]);

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="compactness">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
            <TriangleRightIcon
              width={16}
              height={16}
              className="transition-transform duration-200 group-data-[state=open]:rotate-90"
            />
            <Heading size="5">Compactness</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content className="pl-8">
          {/* Cut Edges */}
          <Heading size="3" align="center" mb="2" mt="4">
            Cut Edges
          </Heading>
          {cut_edges ? (
            <>
              <Text size="2" mb="2" as="p">
                Your plan has <strong>{cut_edges.cut_count.toLocaleString()}</strong> cut edges
                between {cut_edges.unit_type}s.
              </Text>
              <Text size="2" as="p">
                One measurement of compactness is the number of <strong>cut edges</strong> in a
                districting plan. This counts the number of adjacent {cut_edges.unit_type}s that are
                separated into different districts. You should only compare cut edge counts between
                plans for the same state using the same units — a lower number means a more compact
                plan.
              </Text>
            </>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}

          {/* Polsby-Popper */}
          <Heading size="3" align="center" mb="2" mt="4">
            Polsby-Popper Scores
          </Heading>
          <Text size="2" as="p" mb="2">
            The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
            perimeter. Scores range from 0 to 1; higher scores indicate more compact districts.
            Unlike cut edges, this measure depends on map projection and boundary resolution rather
            than the choice of geographic units.
          </Text>
          <ExemplarTable scoreKey="polsby_popper" exemplars={PP_exemplars} />
          {ppStats && (
            <Text size="2" as="p" mb="3">
              In your plan, scores range from <strong>{ppStats.min.toFixed(3)}</strong> to{' '}
              <strong>{ppStats.max.toFixed(3)}</strong>, with a mean of{' '}
              <strong>{ppStats.mean.toFixed(3)}</strong>.
            </Text>
          )}

          {/* Reock */}
          <Heading size="3" align="center" mb="2" mt="4">
            Reock Scores
          </Heading>
          <Text size="2" as="p" mb="2">
            The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of
            the smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1;
            higher scores indicate more compact, circular districts. Reock is sensitive to map
            projection and is computed on-demand when the evaluation view is opened.
          </Text>
          <ExemplarTable scoreKey="reock" exemplars={REOCK_exemplars} />
          {reockStats && (
            <Text size="2" as="p" mb="3">
              In your plan, scores range from <strong>{reockStats.min.toFixed(3)}</strong> to{' '}
              <strong>{reockStats.max.toFixed(3)}</strong>, with a mean of{' '}
              <strong>{reockStats.mean.toFixed(3)}</strong>.
            </Text>
          )}

          {/* Per-district detail */}
          {polsby_popper && (
            <>
              <Text size="2" weight="bold" mb="2" mt="4" as="p">
                Per-district scores
              </Text>
              {/* Table.Root hardcodes a ScrollArea wrapper (overflow:scroll) which breaks
                  position:sticky on Table.Header. This is a known open issue in Radix Themes:
                  https://github.com/radix-ui/themes/issues/584 (optional scrollArea prop)
                  https://github.com/radix-ui/themes/issues/767 (sticky header broken)
                  Workaround: apply Radix's own CSS classes to our own scroll div and render
                  a plain <table> inside. Sub-components have no context dep on Table.Root. */}
              <div
                className={`rt-TableRoot rt-r-size-1 rt-variant-ghost${zones.length > 15 ? ' print:max-h-none' : ''}`}
                style={{
                  width: 'fit-content',
                  borderRight: '1px solid var(--gray-a5)',
                  ...(zones.length > 15
                    ? {maxHeight: 400, overflowY: 'auto', paddingRight: 6}
                    : {}),
                }}
              >
                <table className="rt-TableRootTable">
                  <Table.Header
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 1,
                      backgroundColor: 'var(--color-panel-solid)',
                    }}
                  >
                    <Table.Row>
                      <Table.ColumnHeaderCell justify="center">District</Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">
                        Polsby-
                        <br />
                        Popper
                      </Table.ColumnHeaderCell>
                      <Table.ColumnHeaderCell justify="center">Reock</Table.ColumnHeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {zones.map(zone => (
                      <Table.Row
                        key={zone}
                        tabIndex={0}
                        onMouseEnter={() => onDistrictEnter(zone)}
                        onMouseLeave={onDistrictLeave}
                        onFocus={() => onDistrictEnter(zone)}
                        onBlur={onDistrictLeave}
                        onClick={() => zoomToDistrict(Number(zone))}
                        style={{cursor: 'pointer'}}
                      >
                        <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
                          <DistrictLabel zone={Number(zone)} />
                        </Table.Cell>
                        <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
                          <Text size="2">
                            {formatNumber(polsby_popper[zone], NUMBER_FORMATS.DECIMAL_3)}
                          </Text>
                        </Table.Cell>
                        <Table.Cell justify="center" style={{verticalAlign: 'middle'}}>
                          <Text size="2">
                            {formatNumber((reock ?? {})[zone], NUMBER_FORMATS.DECIMAL_3)}
                          </Text>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </table>
              </div>
            </>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
