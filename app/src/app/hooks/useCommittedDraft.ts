import {useEffect, useRef, useState} from 'react';

/**
 * A text draft that commits when the field loses focus or unmounts (closing a
 * popover unmounts the field, which skips blur). `commit` may return false to
 * refuse the draft, which then goes back to the stored value.
 */
export const useCommittedDraft = (value: string, commit: (draft: string) => boolean | void) => {
  const [draft, setDraft] = useState(value);
  const latest = useRef({draft, value, commit});
  latest.current = {draft, value, commit};
  useEffect(() => setDraft(value), [value]);
  const flush = () => {
    const {draft, value, commit} = latest.current;
    if (draft.trim() !== value && commit(draft) === false) setDraft(value);
  };
  useEffect(() => flush, []);
  return {draft, setDraft, flush};
};
