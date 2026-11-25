'use client';
import {createContext, useCallback, useContext, useEffect, useState} from 'react';

export type LoadStatus = 'loading' | 'ready' | 'failed';

type Parts = Record<string, LoadStatus>;
type SetPart = (part: string, status: LoadStatus | null) => void;

/** Parts every report has. The report is not ready before each has reported. */
const REQUIRED_PARTS = ['plan', 'evaluation', 'map'];

const ReportPartsContext = createContext<SetPart>(() => {});

export const ReportPartsProvider = ReportPartsContext.Provider;

/**
 * The report's load state, gathered from its parts: `failed` once any part has
 * failed, `ready` once every part is ready, `loading` otherwise. `ownParts` are
 * the parts the report page knows itself; the others arrive through `setPart`.
 */
export const useReportStatus = (ownParts: Parts): {status: LoadStatus; setPart: SetPart} => {
  const [reported, setReported] = useState<Parts>({});
  const setPart = useCallback<SetPart>((part, status) => {
    setReported(current => {
      const next = {...current};
      delete next[part];
      if (status) next[part] = status;
      return next;
    });
  }, []);

  const parts = {...reported, ...ownParts};
  const statuses = Object.values(parts);
  let status: LoadStatus = 'loading';
  if (statuses.includes('failed')) {
    status = 'failed';
  } else if (
    REQUIRED_PARTS.every(part => parts[part] === 'ready') &&
    statuses.every(partStatus => partStatus === 'ready')
  ) {
    status = 'ready';
  }
  return {status, setPart};
};

/** Tells the report page the load state of one of its parts. Does nothing on screen. */
export const useReportPart = (part: string, status: LoadStatus) => {
  const setPart = useContext(ReportPartsContext);
  useEffect(() => {
    setPart(part, status);
    return () => setPart(part, null);
  }, [setPart, part, status]);
};
