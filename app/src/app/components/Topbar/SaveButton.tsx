'use client';
import React, {useState} from 'react';
import {Button, IconButton, Spinner, Tooltip} from '@radix-ui/themes';
import {CheckIcon} from '@radix-ui/react-icons';
import {CloudNotSavedIcon, CloudSavedIcon} from './Icons';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {ACCESS_STATES} from '@constants/document/state';

const AUTOSAVE_TIP = 'Autosave is on: changes save automatically after 30 seconds of inactivity.';

/**
 * Always-visible save affordance (autosave still runs; this is the redundant,
 * findable button). The topbar renders the icon variant with a red
 * unsaved-changes badge; tools that read saved state (like the validation
 * checks) render the labeled variant inline.
 */
export const SaveButton: React.FC<{size?: '1' | '2'; iconOnly?: boolean}> = ({
  size = '2',
  iconOnly = false,
}) => {
  const {isOutdated, save} = useMapSaveStatus();
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const [saving, setSaving] = useState(false);

  if (!mapDocument || !isEditing || access !== ACCESS_STATES.EDIT) return null;

  const handleSave = async () => {
    if (!isOutdated || saving) return;
    setSaving(true);
    try {
      await save();
    } finally {
      setSaving(false);
    }
  };

  if (iconOnly) {
    return (
      <Tooltip
        content={
          isOutdated
            ? `You have unsaved changes — click to save now. ${AUTOSAVE_TIP}`
            : `All changes saved. ${AUTOSAVE_TIP}`
        }
      >
        <IconButton
          size={size}
          variant="surface"
          color="gray"
          onClick={handleSave}
          className={isOutdated ? 'cursor-pointer' : ''}
          aria-label={isOutdated ? 'Save changes' : 'All changes saved'}
          data-testid="save-button"
        >
          <span className="relative flex items-center">
            {saving ? (
              <Spinner size="1" />
            ) : isOutdated ? (
              <CloudNotSavedIcon />
            ) : (
              <CloudSavedIcon />
            )}
            {isOutdated && !saving && (
              <span
                className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500"
                aria-hidden
              />
            )}
          </span>
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Tooltip content={AUTOSAVE_TIP}>
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
    </Tooltip>
  );
};
