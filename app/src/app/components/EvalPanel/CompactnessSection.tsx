'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {useMemo} from 'react';
import {Flex, Table, Text, Heading} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {CompactnessExemplars} from './CompactnessExemplars';
import {CompactnessScoreTable} from './CompactnessScoreTable';

interface CompactnessSectionProps {
  evaluation: DocumentEvaluation;
}

interface ScoreStats {
  mean: number;
  min: number;
  max: number;
}

const scoreStats = (scores: Record<string, number> | null | undefined): ScoreStats | null => {
  if (!scores) return null;
  const vals = Object.values(scores).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return {
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
};

/** One score's row of the plan-wide table: its mean, minimum and maximum over the districts. */
const ScoreStatsRow: React.FC<{name: string; stats: ScoreStats | null}> = ({name, stats}) => (
  <Table.Row>
    <Table.Cell justify="center">
      <Text size="2">{name}</Text>
    </Table.Cell>
    {(['mean', 'min', 'max'] as const).map(stat => (
      <Table.Cell key={stat} justify="center">
        <Text size="2">
          {stat} <strong>{stats ? stats[stat].toFixed(3) : '—'}</strong>
        </Text>
      </Table.Cell>
    ))}
  </Table.Row>
);

export const CompactnessSection: React.FC<CompactnessSectionProps> = ({evaluation}) => {
  const {cut_edges, polsby_popper, reock} = evaluation;
  const ppStats = useMemo(() => scoreStats(polsby_popper), [polsby_popper]);
  const reockStats = useMemo(() => scoreStats(reock), [reock]);

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
          {/* Plan-wide figures, in the order the subsections below explain them. */}
          <div style={{width: 'fit-content', maxWidth: '100%', overflowX: 'auto'}}>
            <Table.Root size="1" variant="surface">
              <Table.Body>
                <Table.Row>
                  <Table.Cell justify="center">
                    <Text size="2">Cut edges</Text>
                  </Table.Cell>
                  <Table.Cell justify="center">
                    <Text size="2" weight="bold">
                      {cut_edges ? cut_edges.cut_count.toLocaleString() : '—'}
                    </Text>
                  </Table.Cell>
                  <Table.Cell />
                  <Table.Cell />
                </Table.Row>
                <ScoreStatsRow name="Polsby-Popper" stats={ppStats} />
                <ScoreStatsRow name="Reock" stats={reockStats} />
              </Table.Body>
            </Table.Root>
          </div>

          {/* Cut Edges */}
          <Heading size="3" align="center" mb="2" mt="4">
            Cut Edges
          </Heading>
          {cut_edges ? (
            <Text size="2" as="p">
              One measurement of compactness is the number of <strong>cut edges</strong> in a
              districting plan. This counts the number of adjacent {cut_edges.unit_type}s that are
              separated into different districts. You should only compare cut edge counts between
              plans for the same state using the same units — a lower number means a more compact
              plan.
            </Text>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}

          {/* Polsby-Popper and Reock */}
          <Heading size="3" align="center" mb="2" mt="4">
            Polsby-Popper and Reock Scores
          </Heading>
          <Text size="2" as="p" mb="2">
            The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
            perimeter. Scores range from 0 to 1; higher scores indicate more compact districts.
            Unlike cut edges, this measure depends on map projection and boundary resolution rather
            than the choice of geographic units.
          </Text>
          <Text size="2" as="p" mb="2">
            The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of
            the smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1;
            higher scores indicate more compact, circular districts. Reock is also sensitive to map
            projection.
          </Text>
          <CompactnessExemplars />

          {/* Per-district detail */}
          {polsby_popper && (
            <>
              <Text size="2" weight="bold" mb="2" mt="4" as="p">
                Per-district scores
              </Text>
              <CompactnessScoreTable polsbyPopper={polsby_popper} reock={reock ?? undefined} />
            </>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
