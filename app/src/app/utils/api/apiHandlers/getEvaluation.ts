import {get} from '../factory';

type ElectionKey = string; // e.g., "sen_18"
type RacialGroupKey = 'white' | 'amin' | 'asian_nhpi' | 'h' | 'b'; // Corresonpding to "pop" column prefixes
type ZoneKey = string;
type CountyFIPS = string; // 5-digit FIPS code as a string

type SeatsResult = {
  dem: number;
  rep: number;
  total: number;
};

type VotesResult = {
  dem: number;
  rep: number;
  total: number;
};

type VoteSharesResult = {
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

type AssignedUnitsResult = {
  assigned_count: number;
  partially_assigned_count: number;
  total_count: number;
  unit_type: string;
};

type PopulationDeviationResult = {
  most_populous_district: number;
  least_populous_district: number;
  top_to_bottom_deviation: number;
  maximal_absolute_deviation: number;
};

type CountyPiecesInfo = {
  total_pop: number;
  pieces: number;
  name: string;
};

type UnassignedPopulation = {
  unassigned_population: number;
  total_population: number;
};

export interface DocumentEvaluation {
  seats?: Record<ElectionKey, SeatsResult>;
  votes?: Record<ElectionKey, VotesResult>;
  vote_shares?: Record<ElectionKey, VoteSharesResult>;
  efficiency_gap?: Record<ElectionKey, number>;
  mean_median?: Record<ElectionKey, number>;
  partisan_bias?: Record<ElectionKey, number>;
  eguia?: Record<ElectionKey, number>;
  disproportionality?: Record<ElectionKey, number>;
  competitiveness?: CompetitivenessResult;
  county_pieces?: Record<CountyFIPS, CountyPiecesInfo>;
  ideal_population?: number;
  district_county_membership?: Record<string, string[]>; // zone → sorted list of county FIPS geoids
  cut_edges?: CutEdgesResult;
  polsby_popper?: Record<ZoneKey, number>;
  reock?: Record<ZoneKey, number>;
  majority_districts?: Record<RacialGroupKey, number[]>;
  assigned_units?: AssignedUnitsResult;
  unassigned_population?: UnassignedPopulation;
  population_deviation?: PopulationDeviationResult;
  contiguous?: Record<string, boolean>;
}

export type MetricFailure = {
  key: string;
  error: string;
};

export type MetricsEnvelope = {
  payload_version: number;
  metrics: DocumentEvaluation;
  failed: MetricFailure[];
};

export const getEvaluation = async (document_id?: string) => {
  if (!document_id) {
    return {
      ok: false,
      error: {
        detail: 'No document ID provided',
      },
    } as const;
  }

  return await get<MetricsEnvelope>(`document/${document_id}/evaluation`)({});
};
