import {P1ZoneSummaryStats, P4ZoneSummaryStats} from './api/apiHandlers';

export const getEntryTotal = (entry: Omit<P1ZoneSummaryStats | P4ZoneSummaryStats, 'zone'>) =>
  Object.entries(entry).reduce((total, [key, value]) => {
    if (key !== 'zone') {
      // @ts-ignore
      return total + value; // Sum values of properties except 'zone'
    }
    return total; // Return total unchanged for 'zone'
  }, 0);

export const sumArray = (arr: number[]) => arr.reduce((total, value) => total + value, 0);
export const stdDevArray = (arr: number[]) => {
  const mean = sumArray(arr) / arr.length; // Calculate mean
  const variance = arr.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / arr.length; // Calculate variance
  return Math.sqrt(variance); // Return standard deviation
};

export const stdDevColors = {
  [-2]: '#5e3c9977',
  [-1]: '#b2abd277',
  [0]: '#ffffff',
  [1]: '#fdb86377',
  [2]: '#e6610177',
} as const;

export const getStdDevColor = (value: number) => {
  const floorValue = value > 0 ? Math.floor(value) : Math.ceil(value);
  const cleanValue = (
    floorValue < -2 ? -2 : floorValue > 2 ? 2 : floorValue
  ) as keyof typeof stdDevColors;
  return stdDevColors[cleanValue] || 'none';
};
