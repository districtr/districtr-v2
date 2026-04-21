import {evalColumnConfigs} from '@/app/store/demography/evaluationConfig';
import {choroplethMapVariables} from '@/app/store/demography/constants';
import {AllEvaluationConfigs, AllMapConfigs, AllTabularColumns} from '../api/summaryStats';

export function getAvailableColumnSets(availableColumns: AllTabularColumns[number][]) {
  const evaluation: Record<string, AllEvaluationConfigs> = Object.fromEntries(
    Object.entries(evalColumnConfigs)
      .map(([key, config]) => [
        key,
        config.filter(entry => availableColumns.includes(entry.sourceCol ?? entry.column)),
      ])
      .filter(([, config]) => config.length > 0)
  );
  const map: Record<string, AllMapConfigs> = Object.fromEntries(
    Object.entries(choroplethMapVariables)
      .map(([key, config]) => [key, config.filter(entry => availableColumns.includes(entry.value))])
      .filter(([, config]) => config.length > 0)
  );
  return {evaluation, map};
}
