'use client';
import React from 'react';
import {Heading, Table, Text} from '@radix-ui/themes';
import {formatElectionKey, parseElectionKey} from '@utils/elections';
import {
  findEnsembleMetric,
  formatEnsembleValue,
  type EnsembleMetricDef,
  type EnsembleMetricFocus,
} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT} from './ensembleModalText';
import type {EnsembleSegmentStep} from './ensembleTypes';

/** Statewide offices, most to least prominent; other keys are left out of the
 * table, as the evaluation panel leaves them out. */
const LEVEL_ORDER: Record<string, number> = {pres: 0, sen: 1, gov: 2, ag: 3};

export const sortStatewideElections = (keys: string[]): string[] =>
  keys
    .map(parseElectionKey)
    .filter(election => election.type in LEVEL_ORDER)
    .sort((a, b) =>
      b.year !== a.year
        ? b.year - a.year
        : (LEVEL_ORDER[a.type] ?? 99) - (LEVEL_ORDER[b.type] ?? 99)
    )
    .map(election => election.key);

const PARTISAN_COLUMNS: Array<{metric: string; header: React.ReactNode; width: string}> = [
  {metric: 'seats', header: <>Dem seats</>, width: '8ch'},
  {
    metric: 'disproportionality',
    header: (
      <>
        Dispropor-
        <br />
        tionality
      </>
    ),
    width: '9ch',
  },
  {
    metric: 'efficiency_gap',
    header: (
      <>
        Efficiency
        <br />
        gap
      </>
    ),
    width: '9ch',
  },
  {
    metric: 'mean_median',
    header: (
      <>
        Mean
        <br />
        median
      </>
    ),
    width: '9ch',
  },
  {
    metric: 'partisan_bias',
    header: (
      <>
        Partisan
        <br />
        bias
      </>
    ),
    width: '9ch',
  },
  {metric: 'eguia', header: <>Eguia&apos;s metric</>, width: '9ch'},
];

const OTHER_ROWS: Array<{type: string; metric: string; label?: string}> = [
  {type: 'Competitiveness', metric: 'n_dem_districts'},
  {type: 'Competitiveness', metric: 'n_rep_districts'},
  {type: 'Competitiveness', metric: 'n_swing_districts'},
  {
    type: 'Competitiveness',
    metric: 'n_competitive_contests',
    label: 'Competitive contests (±3 points)',
  },
  {type: 'Splits', metric: 'county_splits'},
  {type: 'Splits', metric: 'county_pieces'},
  {type: 'Compactness', metric: 'cut_edges'},
  {type: 'Compactness', metric: 'polsby_popper_mean'},
  {type: 'Compactness', metric: 'polsby_popper_min'},
  {type: 'Compactness', metric: 'polsby_popper_max'},
  {type: 'Compactness', metric: 'reock_mean'},
  {type: 'Compactness', metric: 'reock_min'},
  {type: 'Compactness', metric: 'reock_max'},
];

const isSelected = (focus: EnsembleMetricFocus, metric: EnsembleMetricDef, election?: string) =>
  focus.metric === metric.id && (!metric.perElection || focus.election === election);

const selectedStyle = (selected: boolean): React.CSSProperties =>
  selected ? {boxShadow: 'inset 0 0 0 2px var(--accent-9)'} : {};

export interface SegmentTablesProps {
  step: EnsembleSegmentStep;
  focus: EnsembleMetricFocus;
  onSelectMetric: (focus: EnsembleMetricFocus) => void;
}

/**
 * The selected step's scores, laid out as the evaluation panel lays out the
 * reader's own plan. Every value is read from the package; selecting a cell
 * charts that metric below.
 */
export const SegmentTables: React.FC<SegmentTablesProps> = ({step, focus, onSelectMetric}) => {
  const elections = sortStatewideElections(Object.keys(step.seats ?? {}));

  const valueCell = (metric: EnsembleMetricDef, election: string | undefined, key: string) => {
    const selected = isSelected(focus, metric, election);
    return (
      <Table.Cell
        key={key}
        justify="center"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        title={`Chart ${metric.label} below`}
        style={{cursor: 'pointer', ...selectedStyle(selected)}}
        onClick={() =>
          onSelectMetric({category: metric.category, metric: metric.id, election})
        }
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectMetric({category: metric.category, metric: metric.id, election});
          }
        }}
      >
        <Text size="2">{formatEnsembleValue(metric.stepValue(step, election), metric.format)}</Text>
      </Table.Cell>
    );
  };

  return (
    <>
      <Heading size="3" mb="2">
        {ENSEMBLE_MODAL_TEXT.partisanTableHeading}
      </Heading>
      <div style={{overflowX: 'auto', maxWidth: '100%'}}>
        <Table.Root size="1" mb="3" variant="surface" style={{tableLayout: 'fixed'}}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell justify="center" style={{width: '10ch'}}>
                Election
              </Table.ColumnHeaderCell>
              {PARTISAN_COLUMNS.map(column => (
                <Table.ColumnHeaderCell
                  key={column.metric}
                  justify="center"
                  style={{width: column.width}}
                >
                  {column.header}
                </Table.ColumnHeaderCell>
              ))}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {elections.map(election => (
              <Table.Row key={election}>
                <Table.Cell justify="center">
                  <Text size="2" weight="bold">
                    {formatElectionKey(election)}
                  </Text>
                </Table.Cell>
                {PARTISAN_COLUMNS.map(column => {
                  const metric = findEnsembleMetric(column.metric)!;
                  return valueCell(metric, election, `${election}-${column.metric}`);
                })}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </div>

      <Heading size="3" mb="2">
        {ENSEMBLE_MODAL_TEXT.otherTableHeading}
      </Heading>
      <div style={{overflowX: 'auto', maxWidth: '100%'}}>
        <Table.Root size="1" variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>{ENSEMBLE_MODAL_TEXT.typeColumn}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>{ENSEMBLE_MODAL_TEXT.scoreColumn}</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell justify="center">
                {ENSEMBLE_MODAL_TEXT.valueColumn}
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {OTHER_ROWS.map((row, index) => {
              const metric = findEnsembleMetric(row.metric)!;
              // The type is named once per group, so the eye reads three blocks
              // rather than thirteen repetitions of the same word.
              const firstOfType = index === 0 || OTHER_ROWS[index - 1].type !== row.type;
              return (
                <Table.Row key={row.metric}>
                  <Table.Cell>
                    <Text size="2" weight={firstOfType ? 'bold' : 'regular'}>
                      {firstOfType ? row.type : ''}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2">{row.label ?? metric.label}</Text>
                  </Table.Cell>
                  {valueCell(metric, undefined, row.metric)}
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      </div>
    </>
  );
};
