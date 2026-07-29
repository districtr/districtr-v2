export const tooltipContent = {
  idealPopulation:
    'The ideal population is the total population divided by the number of districts. Each district should be as close to this number as possible so everyone has equal representation.',
  barScaling:
    'Scale population bars based on the current zone population range to work on defailed population balancing. By default, bars will show from zero to the ideal population.',
  topToBottomDeviation: `The top-to-bottom deviation is the difference in population between the largest and smallest districts.`,
  maxDeviation: `The maximum deviation is the largest deviation from the ideal population. You can use either a percentage of the ideal population, or a fixed number of people.`,
} as const;
