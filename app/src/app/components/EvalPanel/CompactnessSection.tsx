'use client';
import {useMemo} from 'react';
import {EvalSection, EvalSubheading, EvalTableTitle} from './EvalSection';
import {Text} from '@radix-ui/themes';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {CompactnessExemplars} from './CompactnessExemplars';
import {CompactnessScoreTable} from './CompactnessScoreTable';

interface CompactnessSectionProps {
  evaluation: DocumentEvaluation;
}

const scoreStats = (scores: Record<string, number> | null | undefined) => {
  if (!scores) return null;
  const vals = Object.values(scores).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return {
    min: Math.min(...vals),
    max: Math.max(...vals),
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
  };
};

export const CompactnessSection: React.FC<CompactnessSectionProps> = ({evaluation}) => {
  const {cut_edges, polsby_popper, reock} = evaluation;
  const ppStats = useMemo(() => scoreStats(polsby_popper), [polsby_popper]);
  const reockStats = useMemo(() => scoreStats(reock), [reock]);

  return (
    <EvalSection value="compactness" title="Compactness">
      {/* Cut Edges */}
      <EvalSubheading>Cut Edges</EvalSubheading>
      {cut_edges ? (
        <>
          <Text size="2" mb="2" as="p">
            Your plan has <strong>{cut_edges.cut_count.toLocaleString()}</strong> cut edges between{' '}
            {cut_edges.unit_type}s.
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
      <EvalSubheading>Polsby-Popper Scores</EvalSubheading>
      <Text size="2" as="p" mb="2">
        The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its perimeter.
        Scores range from 0 to 1; higher scores indicate more compact districts. Unlike cut edges,
        this measure depends on map projection and boundary resolution rather than the choice of
        geographic units.
      </Text>
      {ppStats && (
        <Text size="2" as="p" mb="3">
          In your plan, scores range from <strong>{ppStats.min.toFixed(3)}</strong> to{' '}
          <strong>{ppStats.max.toFixed(3)}</strong>, with a mean of{' '}
          <strong>{ppStats.mean.toFixed(3)}</strong>.
        </Text>
      )}
      <CompactnessExemplars scoreKey="polsby_popper" planStats={ppStats} />

      {/* Reock */}
      <EvalSubheading>Reock Scores</EvalSubheading>
      <Text size="2" as="p" mb="2">
        The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of the
        smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1; higher
        scores indicate more compact, circular districts. Reock is sensitive to map projection and
        is computed on-demand when the evaluation view is opened.
      </Text>
      {reockStats && (
        <Text size="2" as="p" mb="3">
          In your plan, scores range from <strong>{reockStats.min.toFixed(3)}</strong> to{' '}
          <strong>{reockStats.max.toFixed(3)}</strong>, with a mean of{' '}
          <strong>{reockStats.mean.toFixed(3)}</strong>.
        </Text>
      )}
      <CompactnessExemplars scoreKey="reock" planStats={reockStats} />

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
