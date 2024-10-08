/**
 * A mapping of US state names to their corresponding FIPS codes.
 * @type {Record<string, number | string>} State name (lowercase) to number of string FIPS code.
 * 
 * Districtr reference:
 * Original name: stateNameToFips
 * Original reference: https://github.com/uchicago-dsi/districtr-legacy/blob/701b19fec1aae744cd17111c7836eb7aef8c05a8/src/utils.js#L220
 */
export const stateNameToFips: Record<string, number | string> = {
  alabama: "01",
  alaska: "02",
  arizona: "04",
  arkansas: "05",
  california: "06",
  colorado: "08",
  connecticut: "09",
  delaware: 10,
  dc: 11,
  "district of columbia": 11,
  district_of_columbia: 11,
  districtofcolumbia: 11,
  florida: 12,
  georgia: 13,
  hawaii: 15,
  idaho: 16,
  illinois: 17,
  indiana: 18,
  iowa: 19,
  kansas: 20,
  kentucky: 21,
  louisiana: 22,
  maine: 23,
  maryland: 24,
  massachusetts: 25,
  ma: 25,
  michigan: 26,
  minnesota: 27,
  mississippi: 28,
  missouri: 29,
  montana: 30,
  nebraska: 31,
  nevada: 32,
  "new hampshire": 33,
  new_hampshire: 33,
  newhampshire: 33,
  "new jersey": 34,
  new_jersey: 34,
  newjersey: 34,
  "new mexico": 35,
  new_mexico: 35,
  new_mexico_portal: 35,
  newmexico: 35,
  "new york": 36,
  new_york: 36,
  newyork: 36,
  "north carolina": 37,
  north_carolina: 37,
  northcarolina: 37,
  nc: 37,
  "north dakota": 38,
  north_dakota: 38,
  northdakota: 38,
  ohio: 39,
  oklahoma: 40,
  oregon: 41,
  pennsylvania: 42,
  "rhode island": 44,
  rhode_island: 44,
  rhodeisland: 44,
  "south carolina": 45,
  southcarolina: 45,
  south_carolina: 45,
  "south dakota": 46,
  south_dakota: 46,
  southdakota: 46,
  tennessee: 47,
  texas: 48,
  utah: 49,
  vermont: 50,
  virginia: 51,
  washington: 53,
  "west virginia": 54,
  westvirginia: 55,
  west_virginia: 54,
  wisconsin: 55,
  wyoming: 56,
  "puerto rico": 72,
  puertorico: 72,
  puerto_rico: 72
};
