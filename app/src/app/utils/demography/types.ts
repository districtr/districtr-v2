import { CleanedTOTPOPZoneSummaryStats, CleanedVAPZoneSummaryStats, TOTPOPTotPopSummaryStats, VAPVapPopSummaryStats } from "../api/summaryStats";

export type DemographyRow = {path: string, sourceLayer: string} & TOTPOPTotPopSummaryStats & VAPVapPopSummaryStats;
export type AllPropertyKeys = keyof TOTPOPTotPopSummaryStats | keyof VAPVapPopSummaryStats | keyof CleanedTOTPOPZoneSummaryStats | keyof CleanedVAPZoneSummaryStats | 'zone'
export type MaxRollups = Record<AllPropertyKeys, string>

export type MaxValues = Record<AllPropertyKeys, number>
export type SummaryRecord = Record<AllPropertyKeys, number>
export type TableRow = SummaryRecord & {path: string, sourceLayer: string}
export type SummaryTable = Array<SummaryRecord>