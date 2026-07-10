'use client';
import React, {useState} from 'react';
import {Button} from '@radix-ui/themes';
import {CheckIcon} from '@radix-ui/react-icons';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {ACCESS_STATES} from '@constants/document/state';

/**
 * Always-visible save affordance (autosave still runs; this is the redundant,
 * findable button). Rendered in the topbar and inline near tools that read
 * saved state, like the validation checks.
 */
export const SaveButton: React.FC<{size?: '1' | '2'}> = ({size = '2'}) => {
  const {isOutdated, save} = useMapSaveStatus();
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const [saving, setSaving] = useState(false);

  if (!mapDocument || !isEditing || access !== ACCESS_STATES.EDIT) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Button
      size={size}
      variant={isOutdated ? 'solid' : 'surface'}
      color={isOutdated ? undefined : 'gray'}
      disabled={!isOutdated || saving}
      onClick={handleSave}
      className={isOutdated ? 'cursor-pointer' : ''}
      data-testid="save-button"
    >
      {isOutdated ? (
        saving ? (
          'Saving…'
        ) : (
          'Save changes'
        )
      ) : (
        <>
          <CheckIcon /> Saved
        </>
      )}
    </Button>
  );
};
