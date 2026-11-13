'use client';
import {createContext, useContext} from 'react';

/**
 * How the evaluation components lay themselves out: `screen` is the interactive
 * panel beside the map, `report` is the document meant for paper. The text is the
 * same in both; only layout pieces (sections, tables, controls, the map) differ.
 */
export type EvalMode = 'screen' | 'report';

const EvalModeContext = createContext<EvalMode>('screen');

export const EvalModeProvider = EvalModeContext.Provider;

export const useIsReport = (): boolean => useContext(EvalModeContext) === 'report';

/**
 * The reader's choices in the evaluation's selectors. They live above the sections
 * so that exporting a report can carry them along: the report has no selectors and
 * shows what was selected at the moment of export.
 */
export interface EvalOptions {
  deviationView: 'top_to_bottom' | 'max_absolute' | 'both';
  countyShowMode: 'overly-split-only' | 'all';
  pov: 'dem' | 'rep';
  /** Competitive band, in points either side of 50-50. */
  competitiveBand: '2' | '3' | '5' | '7' | '10';
}

export const DEFAULT_EVAL_OPTIONS: EvalOptions = {
  deviationView: 'top_to_bottom',
  countyShowMode: 'overly-split-only',
  pov: 'dem',
  competitiveBand: '3',
};

const ALLOWED_VALUES: {[K in keyof EvalOptions]: readonly EvalOptions[K][]} = {
  deviationView: ['top_to_bottom', 'max_absolute', 'both'],
  countyShowMode: ['overly-split-only', 'all'],
  pov: ['dem', 'rep'],
  competitiveBand: ['2', '3', '5', '7', '10'],
};

/** Options from a report link's query string; anything missing or unknown falls back to the default. */
export const evalOptionsFromParams = (params: {
  get: (key: string) => string | null;
}): EvalOptions => {
  const options: Record<string, string> = {...DEFAULT_EVAL_OPTIONS};
  for (const key of Object.keys(ALLOWED_VALUES) as (keyof EvalOptions)[]) {
    const value = params.get(key);
    if (value !== null && (ALLOWED_VALUES[key] as readonly string[]).includes(value)) {
      options[key] = value;
    }
  }
  return options as unknown as EvalOptions;
};

export const evalOptionsToQuery = (options: EvalOptions): string =>
  new URLSearchParams({...options}).toString();

interface EvalOptionsContextValue {
  options: EvalOptions;
  setOption: <K extends keyof EvalOptions>(key: K, value: EvalOptions[K]) => void;
}

const EvalOptionsContext = createContext<EvalOptionsContextValue>({
  options: DEFAULT_EVAL_OPTIONS,
  setOption: () => {},
});

export const EvalOptionsProvider = EvalOptionsContext.Provider;

/** One selector's value and its setter, like `useState`. */
export const useEvalOption = <K extends keyof EvalOptions>(
  key: K
): [EvalOptions[K], (value: EvalOptions[K]) => void] => {
  const {options, setOption} = useContext(EvalOptionsContext);
  return [options[key], value => setOption(key, value)];
};
