import { CleanedP1ZoneSummaryStats, CleanedP4ZoneSummaryStats, P1TotPopSummaryStats, P4VapPopSummaryStats } from "../api/summaryStats";

export type DemographyRow = {path: string, sourceLayer: string} & P1TotPopSummaryStats & P4VapPopSummaryStats;
export type AllPropertyKeys = keyof P1TotPopSummaryStats | keyof P4VapPopSummaryStats | keyof CleanedP1ZoneSummaryStats | keyof CleanedP4ZoneSummaryStats
export type MaxRollups = Record<AllPropertyKeys, string>

export type MaxValues = Record<AllPropertyKeys, number>
export type SummaryRecord = Record<AllPropertyKeys, number>
export type TableRow = SummaryRecord & {path: string, sourceLayer: string}
export type SummaryTable = Array<SummaryRecord>