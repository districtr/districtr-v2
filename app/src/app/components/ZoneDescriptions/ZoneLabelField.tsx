'use client';
import {TextField} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useZoneLabel} from '@/app/hooks/useZoneLabel';
import {useCommittedDraft} from '@/app/hooks/useCommittedDraft';
import {MAX_COMMUNITY_NAME_LENGTH} from '@/app/utils/sanitize';

/**
 * Edits a district's label, starting from what's shown (its number by default).
 * Saves on blur, Enter or unmount, and Escape discards the edit; clearing it
 * goes back to the number. A label another district already has is refused
 * with a notice.
 */
export const ZoneLabelField: React.FC<{
  zone: number;
  autoFocus?: boolean;
  /** Called after the field saves or gives up its edit. */
  onDone?: () => void;
  style?: React.CSSProperties;
}> = ({zone, autoFocus, onDone, style}) => {
  const label = useZoneLabel(zone);
  const field = useCommittedDraft(label, draft => {
    const {setZoneAlias, setNotification} = useMapStore.getState();
    const refusal = setZoneAlias(zone, draft);
    if (refusal === null) return true;
    setNotification({message: refusal, type: 'error', importance: 2});
    return false;
  });
  return (
    <TextField.Root
      size="1"
      placeholder={String(zone)}
      aria-label="District label"
      autoFocus={autoFocus}
      maxLength={MAX_COMMUNITY_NAME_LENGTH}
      style={style}
      {...field.fieldProps}
      onChange={e => field.setDraft(e.target.value)}
      onBlur={() => {
        field.flush();
        onDone?.();
      }}
      onClick={e => e.stopPropagation()}
      onKeyUp={e => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
};
