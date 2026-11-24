import {expect, test} from 'bun:test';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {isPlanComplete} from './planCompleteness';

type AssignedUnits = NonNullable<DocumentEvaluation['assigned_units']>;

const units = (counts: Partial<AssignedUnits>): AssignedUnits => ({
  assigned_count: 10,
  split_count: 0,
  partially_assigned_count: 0,
  total_count: 10,
  unit_type: 'vtd',
  assigned_child_count: null,
  total_child_count: null,
  ...counts,
});

const drawn = (districts: number): DocumentEvaluation['contiguous'] =>
  Object.fromEntries(Array.from({length: districts}, (_, i) => [String(i + 1), true]));

test('every unit assigned and every district drawn is complete', () => {
  expect(isPlanComplete({assigned_units: units({}), contiguous: drawn(3)}, 3)).toBe(true);
});

test('a unit split into fully assigned blocks counts as assigned', () => {
  const evaluation = {assigned_units: units({assigned_count: 8, split_count: 2})};
  expect(isPlanComplete(evaluation, null)).toBe(true);
});

test('an unassigned or partly assigned unit leaves the plan unfinished', () => {
  expect(isPlanComplete({assigned_units: units({assigned_count: 9})}, null)).toBe(false);
  const partlyAssigned = units({assigned_count: 9, split_count: 1, partially_assigned_count: 1});
  expect(isPlanComplete({assigned_units: partlyAssigned}, null)).toBe(false);
});

test('a district without units leaves the plan unfinished', () => {
  expect(isPlanComplete({assigned_units: units({}), contiguous: drawn(2)}, 3)).toBe(false);
});

test('a missing district count leaves the answer to the units', () => {
  expect(isPlanComplete({assigned_units: units({})}, 3)).toBe(true);
  expect(isPlanComplete({assigned_units: units({}), contiguous: drawn(2)}, undefined)).toBe(true);
});

test('missing unit counts give no answer', () => {
  expect(isPlanComplete({contiguous: drawn(3)}, 3)).toBeNull();
});
