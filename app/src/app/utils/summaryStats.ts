import { P1ZoneSummaryStats } from "./api/apiHandlers";

export const getEntryTotal = (entry: Omit<P1ZoneSummaryStats, 'zone'>) =>
  Object.entries(entry).reduce((total, [key, value]) => {
    if (key !== 'zone') {
      return total + value; // Sum values of properties except 'zone'
    }
    return total; // Return total unchanged for 'zone'
  }, 0);


export const sumArray = (arr: number[]) => arr.reduce((total, value) => total + value, 0);
export const stdDevArray = (arr: number[]) => {
    const mean = sumArray(arr) / arr.length; // Calculate mean
    const variance = arr.reduce((total, value) => total + Math.pow(value - mean, 2), 0) / arr.length; // Calculate variance
    return Math.sqrt(variance); // Return standard deviation
}

export const getStdDevColor = (value: number) => {
  if (value <= -2){
    return '#5e3c9977'
  } else if (value <= -1){
    return '#b2abd277'
  } else if (value > 2){
    return '#e6610177'
  } else if (value > 1){
    return '#fdb86377'
  } else {
    return "none"
  }
}