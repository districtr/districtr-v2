import {ACS_UNIVERSES, SUMMARY_TYPES, type SummaryType} from '@constants/demography/summary';
import {useDemographyStore} from '@store/demography/demographyStore';

/** Column sets for the Demographics sections: population plus whichever ACS
 * universes this map carries. DemographyTable's universe select doesn't check
 * availability itself — an unavailable set would render as an error. */
export const useDemographicsColumnSets = (): SummaryType[] => {
  const availableEval = useDemographyStore(state => state.availableColumnSets.evaluation);
  return [
    SUMMARY_TYPES.TOTPOP,
    SUMMARY_TYPES.VAP,
    ...ACS_UNIVERSES.filter(universe => availableEval[universe]),
  ];
};
