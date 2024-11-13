import { P1ZoneSummaryStats } from "./api/apiHandlers";

export const getEntryTotal = (entry: Omit<P1ZoneSummaryStats, 'zone'>) =>
  Object.entries(entry).reduce((total, [key, value]) => {
    if (key !== 'zone') {
      return total + value; // Sum values of properties except 'zone'
    }
    return total; // Return total unchanged for 'zone'
  }, 0);