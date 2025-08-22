// utils to coerce attribute strings
export const readBool = (val: unknown, def = true) => {
  // attribute missing
  if (val === undefined || val === null) return def;
  // boolean attribute present without value => HTML gives empty string => true
  if (val === '') return true;
  // common string forms
  if (val === 'true' || val === '1') return true;
  if (val === 'false' || val === '0') return false;

  // try JSON.parse for "true"/"false" written as JSON or other literals
  try {
    const parsed = JSON.parse(String(val));
    if (typeof parsed === 'boolean') return parsed;
  } catch {
    /* ignore */
  }
  return def;
};

export const readNumber = (val: unknown, def?: number) => {
  if (val === undefined || val === null || val === '') return def;
  const n = Number(val);
  return Number.isFinite(n) ? n : def;
};

export const readCSV = (val: unknown) =>
  typeof val === 'string' && val.length
    ? val
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    : undefined;

export const readJSON = <T = unknown>(val: unknown, def?: T) => {
  if (val === undefined || val === null || val === '') return def;
  try {
    return JSON.parse(String(val)) as T;
  } catch {
    return def;
  }
};
