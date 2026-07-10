'use client';
import React, {useState} from 'react';
import {IconButton, Spinner, Tooltip} from '@radix-ui/themes';
import {CloudNotSavedIcon, CloudSavedIcon} from './Icons';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {ACCESS_STATES} from '@constants/document/state';

const AUTOSAVE_TIP = 'Autosave is on: changes save automatically after 30 seconds of inactivity.';

/**
 * Always-visible topbar save affordance (autosave still runs; this is the
 * redundant, findable button): a cloud icon with a red unsaved-changes badge.
 */
export const SaveButton: React.FC = () => {
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

  return (
    <Tooltip
      content={
        isOutdated
          ? `You have unsaved changes — click to save now. ${AUTOSAVE_TIP}`
          : `All changes saved. ${AUTOSAVE_TIP}`
      }
    >
      <IconButton
        size="2"
        variant="surface"
        color="gray"
        onClick={handleSave}
        className={isOutdated ? 'cursor-pointer' : ''}
        aria-label={isOutdated ? 'Save changes' : 'All changes saved'}
        data-testid="save-button"
      >
        <span className="relative flex items-center">
          {saving ? <Spinner size="1" /> : isOutdated ? <CloudNotSavedIcon /> : <CloudSavedIcon />}
          {isOutdated && !saving && (
            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-red-500" aria-hidden />
          )}
        </span>
      </IconButton>
    </Tooltip>
  );
};
