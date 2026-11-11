import {useEffect, useRef, useState} from 'react';

/**
 * A text draft that commits when the field loses focus or unmounts (closing a
 * popover unmounts the field, which skips blur), and that Escape throws away.
 * `commit` may return false to refuse the draft, which then goes back to the
 * stored value.
 */
export const useCommittedDraft = (
  value: string,
  commit: (draft: string) => boolean | void,
  /** The draft as it would be stored, compared with `value`. */
  clean: (draft: string) => string = draft => draft.trim()
) => {
  const [draft, setDraft] = useState(value);
  const latest = useRef({draft, value, commit, clean});
  latest.current = {draft, value, commit, clean};
  useEffect(() => setDraft(value), [value]);
  const flush = () => {
    const {draft, value, commit, clean} = latest.current;
    // A draft that cleans up to the stored value ("North  Shore") is no edit;
    // show the stored text again instead of saving.
    if (clean(draft) === value) {
      if (draft !== value) setDraft(value);
    } else if (commit(draft) === false) {
      setDraft(value);
    }
  };
  useEffect(() => flush, []);
  /** Escape: back to the stored value, and out of the field without saving. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key !== 'Escape') return;
    // Set the ref now: the blur below flushes before the re-render.
    latest.current.draft = latest.current.value;
    setDraft(latest.current.value);
    e.currentTarget.blur();
  };
  /** Spread on the field: wires it up and marks it for draftContainerFocusProps. */
  const fieldProps = {
    value: draft,
    onBlur: flush,
    onKeyDown,
    'data-draft-field': '',
  };
  return {draft, setDraft, flush, fieldProps};
};

/**
 * For a popover or dialog holding draft fields: Escape inside one only
 * leaves the field (discarding its draft), and a second Escape closes. Opening
 * focuses the container, not the first field, so a keypress meant as a
 * shortcut (a digit selects a district) doesn't land in the field.
 */
export const draftContainerFocusProps = {
  onOpenAutoFocus: (e: Event) => {
    e.preventDefault();
    (e.target as HTMLElement | null)?.focus();
  },
  onEscapeKeyDown: (e: KeyboardEvent) => {
    if ((e.target as HTMLElement | null)?.dataset?.draftField !== undefined) e.preventDefault();
  },
};
