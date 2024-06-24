// create a type for the drawn zone, ascending int
export type Zone = number;

export type GEOID = string;

// create a dict of zone: [geoid]
export type ZoneDict = Map<GEOID, Zone>;
