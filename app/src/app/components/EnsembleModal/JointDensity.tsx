'use client';
import React, {useMemo, useState} from 'react';
import {Group} from '@visx/group';
import {Line} from '@visx/shape';
import {scaleLinear} from '@visx/scale';
import {AxisBottom, AxisLeft} from '@visx/axis';
import {Text as ThemeText} from '@radix-ui/themes';
import {formatShare} from '@utils/ensembleStats';
import {formatEnsembleValue, type EnsembleValueFormat} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import {
  axisCoordinate,
  buildJointGrid,
  cellAt,
  cellLabel,
  cellSpan,
  type JointAxis,
} from './ensembleJoint';
import type {EnsembleJoint} from './ensembleTypes';

const MARGIN = {top: 12, right: 18, bottom: 48, left: 68};
/** An integer axis with more values than this is drawn in groups of values. */
const MAX_CELLS = 60;
/** Below this many cells an integer or discrete axis is labelled at every cell. */
const LABEL_EVERY_CELL = 24;
/** One hue, light to dark, by share of plans. The square root spreads the
 * steps over a peaked distribution so the thin tails stay visible. */
const SHADES = [
  'var(--teal-4)',
  'var(--teal-5)',
  'var(--teal-6)',
  'var(--teal-7)',
  'var(--teal-8)',
  'var(--teal-9)',
  'var(--teal-11)',
];
const PLAN_COLOR = 'var(--accent-9)';
const STEP_COLOR = 'var(--amber-10)';
const AXIS_COLOR = 'var(--gray-a8)';
const INK = 'var(--gray-12)';
const MUTED_INK = 'var(--gray-11)';
const MARKER_RADIUS = 5;

const shade = (share: number, maxShare: number) => {
  if (share <= 0 || maxShare <= 0) return undefined;
  const t = Math.sqrt(share / maxShare);
  return SHADES[Math.min(SHADES.length - 1, Math.floor(t * SHADES.length))];
};

/** A point to mark; either coordinate may be missing. */
export interface JointPoint {
  x?: number;
  y?: number;
}

export interface JointDensityProps {
  joint: EnsembleJoint;
  xLabel: string;
  yLabel: string;
  xFormat: EnsembleValueFormat;
  yFormat: EnsembleValueFormat;
  plan?: JointPoint;
  planLabel: string;
  step?: JointPoint;
  stepLabel: string;
  width: number;
  height: number;
}

const finite = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value);

/** Domain of an axis in its own coordinate, stretched to hold the markers. */
const axisDomain = (axis: JointAxis, values: (number | undefined)[]): [number, number] => {
  let low = cellSpan(axis, 0)[0];
  let high = cellSpan(axis, axis.cells.length - 1)[1];
  values.filter(finite).forEach(value => {
    const coordinate = axisCoordinate(axis, value);
    low = Math.min(low, coordinate);
    high = Math.max(high, coordinate);
  });
  if (high <= low) high = low + 1;
  return [low, high];
};

/** Tick positions and labels for an axis: every cell when there are few
 * exact values, evenly spaced values otherwise. */
const axisTicks = (axis: JointAxis, format: EnsembleValueFormat) => {
  const exact = axis.cells.every(cell => cell.value !== undefined);
  if (axis.kind === 'discrete' || (exact && axis.cells.length <= LABEL_EVERY_CELL)) {
    return {
      tickValues: axis.cells.map((_, index) =>
        axis.kind === 'discrete' ? index : axis.cells[index].value!
      ),
      tickFormat: (value: number) =>
        axis.kind === 'discrete'
          ? cellLabel(axis, Math.round(value), format)
          : formatEnsembleValue(value, format),
    };
  }
  return {tickValues: undefined, tickFormat: (value: number) => formatEnsembleValue(value, format)};
};

/**
 * The ensemble's plans by two scores at once, as a grid of cells shaded by
 * share of plans, with the evaluated plan and the selected step marked.
 *
 * The grid is laid out once per pair and size; hover moves a highlight and a
 * caption and recomputes nothing else.
 */
export const JointDensity: React.FC<JointDensityProps> = ({
  joint,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
  plan,
  planLabel,
  step,
  stepLabel,
  width,
  height,
}) => {
  const [hovered, setHovered] = useState<{row: number; column: number} | null>(null);
  const innerWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(0, height - MARGIN.top - MARGIN.bottom);

  const grid = useMemo(() => buildJointGrid(joint, MAX_CELLS), [joint]);

  const layout = useMemo(() => {
    if (!grid) return null;
    const xScale = scaleLinear<number>({
      domain: axisDomain(grid.x, [plan?.x, step?.x]),
      range: [0, innerWidth],
    });
    const yScale = scaleLinear<number>({
      domain: axisDomain(grid.y, [plan?.y, step?.y]),
      range: [innerHeight, 0],
    });
    const cells = grid.shares.flatMap((row, rowIndex) =>
      row.map((share, columnIndex) => {
        const [x0, x1] = cellSpan(grid.x, columnIndex);
        const [y0, y1] = cellSpan(grid.y, rowIndex);
        return {
          row: rowIndex,
          column: columnIndex,
          share,
          x: xScale(x0),
          y: yScale(y1),
          width: Math.max(1, xScale(x1) - xScale(x0)),
          height: Math.max(1, yScale(y0) - yScale(y1)),
          fill: shade(share, grid.maxShare),
        };
      })
    );
    return {xScale, yScale, cells};
  }, [grid, plan?.x, plan?.y, step?.x, step?.y, innerWidth, innerHeight]);

  // The cells are the bulk of the drawing; hover leaves them untouched.
  const cellLayer = useMemo(
    () =>
      layout?.cells.map(cell =>
        cell.fill ? (
          <rect
            key={`${cell.row}:${cell.column}`}
            x={cell.x}
            y={cell.y}
            width={cell.width}
            height={cell.height}
            fill={cell.fill}
          />
        ) : null
      ),
    [layout]
  );

  if (!grid || !layout || innerWidth <= 0 || innerHeight <= 0) return null;
  const {xScale, yScale, cells} = layout;
  const xTicks = axisTicks(grid.x, xFormat);
  const yTicks = axisTicks(grid.y, yFormat);

  const position = (point: JointPoint | undefined) => ({
    x: point && finite(point.x) ? xScale(axisCoordinate(grid.x, point.x)) : undefined,
    y: point && finite(point.y) ? yScale(axisCoordinate(grid.y, point.y)) : undefined,
  });
  const planAt = position(plan);
  const stepAt = position(step);

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = cellAt(grid.x, xScale.invert(event.clientX - bounds.left));
    const row = cellAt(grid.y, yScale.invert(event.clientY - bounds.top));
    const next = column === null || row === null ? null : {row, column};
    setHovered(current =>
      current?.row === next?.row && current?.column === next?.column ? current : next
    );
  };

  const hoveredCell = hovered ? cells[hovered.row * grid.x.cells.length + hovered.column] : null;

  const legendLine = (color: string, label: string, dashed: boolean) => (
    <span key={label} style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
      <svg width={14} height={14} aria-hidden="true">
        <circle
          cx={7}
          cy={7}
          r={MARKER_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '2 2' : undefined}
        />
      </svg>
      <ThemeText size="1" style={{color: INK}}>
        {label}
      </ThemeText>
    </span>
  );

  return (
    <div style={{position: 'relative', width}}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Plans of the ensemble by ${xLabel} and ${yLabel}`}
      >
        <Group left={MARGIN.left} top={MARGIN.top}>
          {cellLayer}
          {hoveredCell && (
            <rect
              x={hoveredCell.x}
              y={hoveredCell.y}
              width={hoveredCell.width}
              height={hoveredCell.height}
              fill="none"
              stroke={INK}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {planAt.x !== undefined && (
            <Line
              from={{x: planAt.x, y: 0}}
              to={{x: planAt.x, y: innerHeight}}
              stroke={PLAN_COLOR}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {planAt.y !== undefined && (
            <Line
              from={{x: 0, y: planAt.y}}
              to={{x: innerWidth, y: planAt.y}}
              stroke={PLAN_COLOR}
              strokeWidth={1}
              pointerEvents="none"
            />
          )}
          {planAt.x !== undefined && planAt.y !== undefined && (
            <circle
              cx={planAt.x}
              cy={planAt.y}
              r={MARKER_RADIUS}
              fill="none"
              stroke={PLAN_COLOR}
              strokeWidth={2}
              pointerEvents="none"
            />
          )}
          {stepAt.x !== undefined && stepAt.y !== undefined && (
            <circle
              cx={stepAt.x}
              cy={stepAt.y}
              r={MARKER_RADIUS}
              fill="none"
              stroke={STEP_COLOR}
              strokeWidth={2}
              strokeDasharray="2 2"
              pointerEvents="none"
            />
          )}
          <rect
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHovered(null)}
          />
          <AxisLeft
            scale={yScale}
            numTicks={yTicks.tickValues ? undefined : 5}
            tickValues={yTicks.tickValues}
            label={yLabel}
            labelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle'}}
            labelOffset={40}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => yTicks.tickFormat(Number(value))}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'end', dx: -4, dy: 4}}
          />
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={xTicks.tickValues ? undefined : 6}
            tickValues={xTicks.tickValues}
            label={xLabel}
            labelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle'}}
            labelOffset={18}
            stroke={AXIS_COLOR}
            tickStroke={AXIS_COLOR}
            tickFormat={value => xTicks.tickFormat(Number(value))}
            tickLabelProps={{fill: MUTED_INK, fontSize: 11, textAnchor: 'middle', dy: 2}}
          />
        </Group>
      </svg>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 16,
          rowGap: 4,
          alignItems: 'center',
          paddingLeft: MARGIN.left,
          marginTop: 4,
        }}
      >
        <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
          <ThemeText size="1" style={{color: MUTED_INK}}>
            {ENSEMBLE_MODAL_TEXT.jointLegendFew}
          </ThemeText>
          <svg width={SHADES.length * 10} height={10} aria-hidden="true">
            {SHADES.map((fill, index) => (
              <rect key={fill} x={index * 10} y={0} width={10} height={10} fill={fill} />
            ))}
          </svg>
          <ThemeText size="1" style={{color: MUTED_INK}}>
            {fillEnsembleText(ENSEMBLE_MODAL_TEXT.jointLegendMany, {
              share: formatShare(grid.maxShare),
            })}
          </ThemeText>
        </span>
        {planAt.x !== undefined || planAt.y !== undefined
          ? legendLine(PLAN_COLOR, planLabel, false)
          : null}
        {stepAt.x !== undefined && stepAt.y !== undefined
          ? legendLine(STEP_COLOR, stepLabel, true)
          : null}
      </div>
      {hoveredCell && (
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
            {fillEnsembleText(ENSEMBLE_MODAL_TEXT.jointHover, {
              x: xLabel,
              xRange: cellLabel(grid.x, hoveredCell.column, xFormat),
              y: yLabel,
              yRange: cellLabel(grid.y, hoveredCell.row, yFormat),
              share: formatShare(hoveredCell.share),
            })}
          </ThemeText>
        </div>
      )}
    </div>
  );
};
