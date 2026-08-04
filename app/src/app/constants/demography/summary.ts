export const SUMMARY_TYPES = {
  TOTPOP: 'TOTPOP',
  VAP: 'VAP',
  VOTERHISTORY: 'VOTERHISTORY',
} as const;

export type SummaryType = (typeof SUMMARY_TYPES)[keyof typeof SUMMARY_TYPES];

export const COALITION_UNIVERSES = {
  TOTPOP: SUMMARY_TYPES.TOTPOP,
  VAP: SUMMARY_TYPES.VAP,
} as const;
export type CoalitionUniverse = (typeof COALITION_UNIVERSES)[keyof typeof COALITION_UNIVERSES];

export const isCoalitionUniverse = (universe: SummaryType): universe is CoalitionUniverse =>
  Object.values(COALITION_UNIVERSES as Record<string, SummaryType>).includes(universe);

export const TOTAL_COLUMN: Record<SummaryType, string | undefined> = {
  VAP: 'total_vap_20',
  TOTPOP: 'total_pop_20',
  VOTERHISTORY: undefined,
} as const;

/**
 * The two top-level choropleth overlay toggles. Coarser than SummaryType:
 * the population overlay spans both the TOTPOP and VAP statistical
 * universes as one merged control, not two.
 */
export type OverlayGroup = 'demography' | 'election';

export const OVERLAY_GROUP_SUMMARY_TYPES: Record<OverlayGroup, SummaryType[]> = {
  demography: [SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP],
  election: [SUMMARY_TYPES.VOTERHISTORY],
};

/** Which overlay group a statistical universe's variables belong to. */
export const toOverlayGroup = (summaryType: SummaryType): OverlayGroup =>
  summaryType === SUMMARY_TYPES.VOTERHISTORY ? 'election' : 'demography';
