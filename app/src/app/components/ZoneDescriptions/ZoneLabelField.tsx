'use client';
import {TextField} from '@radix-ui/themes';
import {useMapStore} from '@/app/store/mapStore';
import {useZoneLabel} from '@/app/hooks/useZoneLabel';
import {useCommittedDraft} from '@/app/hooks/useCommittedDraft';
import {MAX_COMMUNITY_NAME_LENGTH} from '@/app/utils/sanitize';
import {cleanZoneLabel} from '@/app/utils/zoneLabels';

/**
 * Edits a district's label, starting from what's shown (its number by default).
 * Saves on blur, Enter or unmount, and Escape discards the edit; clearing it
 * goes back to the number. A label another district already has gets a _2,
 * _3, … suffix (see setZoneAlias).
 */
export const ZoneLabelField: React.FC<{
  zone: number;
  autoFocus?: boolean;
  /** Called after the field saves or gives up its edit. */
  onDone?: () => void;
  style?: React.CSSProperties;
}> = ({zone, autoFocus, onDone, style}) => {
  const label = useZoneLabel(zone);
  const field = useCommittedDraft(
    label,
    draft => {
      useMapStore.getState().setZoneAlias(zone, draft);
      return true;
    },
    // Blank means the default label, the district's number.
    draft => cleanZoneLabel(draft) || String(zone)
  );
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
