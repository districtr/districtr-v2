'use client';
import {useMemo} from 'react';
import {EvalSection, EvalSubheading, EvalTableTitle} from './EvalSection';
import {Table, Text} from '@radix-ui/themes';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {CompactnessExemplars} from './CompactnessExemplars';
import {CompactnessScoreTable} from './CompactnessScoreTable';
import {useIsReport} from './evalMode';

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
  const isReport = useIsReport();

  return (
    <EvalSection value="compactness" title="Compactness">
      {/* Plan-wide figures, in the order the subsections below explain them. */}
      <EvalTableTitle reportOnly>
        Compactness of the plan: cut edges, Polsby-Popper scores and Reock scores
      </EvalTableTitle>
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
      <EvalSubheading>Cut Edges</EvalSubheading>
      {cut_edges ? (
        <Text size="2" as="p">
          One measurement of compactness is the number of <strong>cut edges</strong> in a
          districting plan. This counts the number of adjacent {cut_edges.unit_type}s that are
          separated into different districts. You should only compare cut edge counts between plans
          for the same state using the same units — a lower number means a more compact plan.
        </Text>
      ) : (
        <Text size="2">Not available for this plan.</Text>
      )}

      {/* Polsby-Popper and Reock */}
      <EvalSubheading>Polsby-Popper and Reock Scores</EvalSubheading>
      <Text size="2" as="p" mb="2">
        The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its perimeter.
        Scores range from 0 to 1; higher scores indicate more compact districts. Unlike cut edges,
        this measure depends on map projection and boundary resolution rather than the choice of
        geographic units.
      </Text>
      <Text size="2" as="p" mb="2">
        The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of the
        smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1; higher
        scores indicate more compact, circular districts. Reock is also sensitive to map projection.
      </Text>
      {!isReport && <CompactnessExemplars />}

      {/* Per-district detail */}
      {polsby_popper && (
        <>
          <EvalTableTitle spaced>Compactness scores by district</EvalTableTitle>
          <CompactnessScoreTable polsbyPopper={polsby_popper} reock={reock ?? undefined} />
        </>
      )}
    </EvalSection>
  );
};
