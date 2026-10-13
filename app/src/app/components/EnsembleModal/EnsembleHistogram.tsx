'use client';
import React, {useMemo, useState} from 'react';
import {Group} from '@visx/group';
import {Bar, Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom, AxisLeft} from '@visx/axis';
import {Text as ThemeText} from '@radix-ui/themes';
import {formatEnsembleValue, type EnsembleValueFormat} from './ensembleMetrics';
import type {EnsembleDistribution} from './ensembleTypes';

const MARGIN = {top: 34, right: 18, bottom: 40, left: 56};
const DEFAULT_HEIGHT = 280;
/** Bar fills recede; the two markers carry the color weight. */
const BAR_FILL = 'var(--gray-a7)';
const BAR_FILL_HOVER = 'var(--gray-a9)';
const PLAN_COLOR = 'var(--accent-9)';
const STEP_COLOR = 'var(--amber-10)';
const AXIS_COLOR = 'var(--gray-a8)';
const INK = 'var(--gray-12)';
const MUTED_INK = 'var(--gray-11)';

interface Bucket {
  /** Inclusive-exclusive value span the bar covers. */
  from: number;
  to: number;
  percent: number;
  count: number;
}

export interface EnsembleHistogramProps {
  dist: EnsembleDistribution;
  format: EnsembleValueFormat;
  /** Value for the plan being edited; drawn as the labelled "This plan" marker. */
  planValue?: number;
  planLabel: string;
  /** Value for the segment step selected in the demonstration section. */
  stepValue?: number;
  stepLabel: string;
  width: number;
  height?: number;
  /** Named on the vertical axis, so the chart reads on its own. */
  percentAxisLabel?: string;
  /** The charted series, for the figure's accessible name. */
  metricLabel: string;
}

/** Bucket spans: one unit wide and centered on the value for an integer series,
 * the bucket's own edges for a continuous one. */
const buildBuckets = (dist: EnsembleDistribution): Bucket[] => {
  const total = dist.counts.reduce((sum, count) => sum + count, 0) || 1;
  if (dist.kind === 'integer') {
    return dist.edges.map((value, index) => ({
      from: value - 0.5,
      to: value + 0.5,
      count: dist.counts[index] ?? 0,
      percent: ((dist.counts[index] ?? 0) / total) * 100,
    }));
  }
  return dist.counts.map((count, index) => ({
    from: dist.edges[index],
    to: dist.edges[index + 1],
    count,
    percent: (count / total) * 100,
  }));
};

/** Label for the span a bar covers: the integer itself, or the bucket's range. */
const bucketLabel = (bucket: Bucket, dist: EnsembleDistribution, format: EnsembleValueFormat) =>
  dist.kind === 'integer'
    ? formatEnsembleValue(Math.round((bucket.from + bucket.to) / 2), format)
    : `${formatEnsembleValue(bucket.from, format)} to ${formatEnsembleValue(bucket.to, format)}`;

/**
 * The ensemble's distribution for one metric, with the current plan and the
 * selected demonstration step marked on it.
 *
 * Layout is computed once per metric, size or marker change and then only read
 * during hover, so moving the pointer over the bars re-renders a fill and a
 * tooltip and nothing else.
 */
export const EnsembleHistogram: React.FC<EnsembleHistogramProps> = ({
  dist,
  format,
  planValue,
  planLabel,
  stepValue,
  stepLabel,
  width,
  height = DEFAULT_HEIGHT,
  percentAxisLabel,
  metricLabel,
}) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const layout = useMemo(() => {
    const buckets = buildBuckets(dist);
    let domainMin = buckets.length ? buckets[0].from : 0;
    let domainMax = buckets.length ? buckets[buckets.length - 1].to : 1;
    // The axis stretches to hold a plan whose value falls outside everything the
    // ensemble reached — that gap is the whole point of the comparison.
    [planValue, stepValue].forEach(value => {
      if (value === undefined || !Number.isFinite(value)) return;
      const low = dist.kind === 'integer' ? Math.floor(value) - 0.5 : value;
      const high = dist.kind === 'integer' ? Math.ceil(value) + 0.5 : value;
      domainMin = Math.min(domainMin, low);
      domainMax = Math.max(domainMax, high);
    });
    if (domainMax <= domainMin) domainMax = domainMin + 1;
    const maxPercent = buckets.reduce((max, bucket) => Math.max(max, bucket.percent), 0);
    const xScale = scaleLinear<number>({domain: [domainMin, domainMax], range: [0, innerWidth]});
    const yScale = scaleLinear<number>({
      domain: [0, maxPercent || 1],
      range: [innerHeight, 0],
      nice: true,
    });
    const tickValues = dist.kind === 'integer' && dist.edges.length <= 24 ? dist.edges : undefined;
    // A metric spread over a hundred buckets peaks at a percent or two, where
    // whole-number ticks would repeat themselves.
    const percentDigits = maxPercent < 5 ? 1 : 0;
    return {buckets, xScale, yScale, tickValues, percentDigits};
  }, [dist, planValue, stepValue, innerWidth, innerHeight]);

  if (innerWidth <= 0 || innerHeight <= 0) return null;
  const {buckets, xScale, yScale, tickValues, percentDigits} = layout;

  const marker = (value: number | undefined, label: string, color: string, dashed: boolean) => {
    if (value === undefined || !Number.isFinite(value)) return null;
    const x = xScale(value);
    const text = `${label} · ${formatEnsembleValue(value, format)}`;
    // Keep the label inside the plot: it flips to the other side of its line
    // near the right edge rather than being clipped.
    const flip = x > innerWidth - text.length * 6;
    return (
      <Group key={label}>
        <Line
          from={{x, y: 0}}
          to={{x, y: innerHeight}}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
        <text
          x={flip ? x - 6 : x + 6}
          y={-10}
          textAnchor={flip ? 'end' : 'start'}
          fontSize={12}
          fontWeight={600}
          fill={color}
        >
          {text}
        </text>
      </Group>
    );
  };

  const hoveredBucket = hovered === null ? null : buckets[hovered];

  return (
    <div style={{position: 'relative', width}}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Distribution of ${metricLabel} across the ensemble`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {buckets.map((bucket, index) => {
            const left = xScale(bucket.from);
            const right = xScale(bucket.to);
            const span = right - left;
            // A 2px gap between neighbouring bars, dropped once bars get so thin
            // that the gap would eat them.
            const gap = span > 4 ? 2 : 0;
            const barWidth = Math.max(1, span - gap);
            const barHeight = innerHeight - yScale(bucket.percent);
            return (
              <Bar
                key={index}
                x={left + gap / 2}
                y={yScale(bucket.percent)}
                width={barWidth}
                height={Math.max(barHeight, bucket.count > 0 ? 1 : 0)}
                rx={barWidth >= 4 ? 2 : 0}
                fill={hovered === index ? BAR_FILL_HOVER : BAR_FILL}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}
          {marker(stepValue, stepLabel, STEP_COLOR, true)}
          {marker(planValue, planLabel, PLAN_COLOR, false)}
          <AxisLeft
            scale={yScale}
            numTicks={4}
            label={percentAxisLabel}
            labelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle'}}
            labelOffset={28}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => `${Number(value).toFixed(percentDigits)}%`}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'end', dx: -4, dy: 4}}
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={tickValues ? undefined : 6}
            tickValues={tickValues}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => formatEnsembleValue(Number(value), format)}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle', dy: 2}}
          />
        </Group>
      </svg>
      {hoveredBucket && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            background: 'var(--color-panel-solid)',
            border: '1px solid var(--gray-a6)',
            borderRadius: 4,
            padding: '2px 6px',
            pointerEvents: 'none',
          }}
        >
          <ThemeText size="1" style={{color: INK}}>
            {bucketLabel(hoveredBucket, dist, format)} · {hoveredBucket.percent.toFixed(1)}% of
            plans
          </ThemeText>
        </div>
      )}
    </div>
  );
};
