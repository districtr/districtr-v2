import {get} from '../factory';

type ElectionKey = string; // e.g., "sen_18"
type RacialGroupKey = "white" | "amin" | "asian_nhpi" | "h" | "b"; // Corresonpding to "pop" column prefixes
type ZoneKey = string;
type CountyFIPS = string; // 5-digit FIPS code as a string
type SeatsResult = {
  dem: number;
  rep: number;
};
type CompetitivenessResult = {
  n_dem_districts: number;
  n_rep_districts: number;
  n_swing_districts: number;
  n_competitive_districts: number;
  n_districts: number;
  n_elections: number;
};

type CutEdgesResult = {
  cut_count: number;
  unit_type: string;
};

export interface DocumentEvaluation {
  seats?: Record<ElectionKey, SeatsResult>;
  efficiency_gap?: Record<ElectionKey, number>;
  mean_median?: Record<ElectionKey, number>;
  partisan_bias?: Record<ElectionKey, number>;
  eguia?: Record<ElectionKey, number>;
  disproportionality?: Record<ElectionKey, number>;
  competitiveness?: CompetitivenessResult;
  county_pieces?: Record<CountyFIPS, [number, number]>; // tuple: [minimum_possible, actual_pieces]
  cut_edges?: CutEdgesResult;
  polsby_popper?: Record<ZoneKey, number>;
  reock?: Record<ZoneKey, number>;
  majority_districts?: Record<RacialGroupKey, number[]>;
}

export const getEvaluation = async (document_id?: string) => {
  if (!document_id) {
    return {
      ok: false,
      error: {
        detail: 'No document ID provided',
      },
    } as const;
  }

  return await get<DocumentEvaluation>(`document/${document_id}/evaluation`)({});
}