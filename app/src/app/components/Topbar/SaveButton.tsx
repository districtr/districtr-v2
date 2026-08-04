'use client';
import React, {useEffect, useState} from 'react';
import {Flex, IconButton, Spinner, Text} from '@radix-ui/themes';
import {CloudNotSavedIcon, CloudSavedIcon} from './Icons';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@store/mapControlsStore';
import {useUiHintStore, useGuideTarget} from '@store/uiHintStore';
import {ACCESS_STATES} from '@constants/document/state';
import {HelpTip, HELP_TIP_FAST_DELAY} from '@components/HelpTip/HelpTip';

const AUTOSAVE_TIP = 'Autosave is on: changes save automatically after 30 seconds of inactivity.';
// Held long enough that a near-instant save doesn't flash by looking like a
// glitch — same beat as autosave's notice.
const NOTICE_MIN_MS = 1500;

/** The bottom-center saving notice, shared by autosave and the save button so
 * both saves look the same and neither takes over the screen. */
export const SavingPill: React.FC<{message: string}> = ({message}) => (
  <Flex
    align="center"
    gap="2"
    className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10000] rounded-full bg-gray-900/90 px-4 py-2 text-white shadow-lg"
  >
    <Spinner size="1" />
    <Text size="2">{message}</Text>
  </Flex>
);

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
  // Guide target for the "Save now" hint; skips when there's nothing to save.
  const {guiding} = useGuideTarget('save-button', !isOutdated);
  const advanceGuide = useUiHintStore(state => state.advanceGuide);

  if (!mapDocument || !isEditing || access !== ACCESS_STATES.EDIT) return null;

  // Silent, like autosave: a manual save is the same operation, so it gets the
  // same bottom-center notice rather than the full-screen lock overlay and
  // saved toast — only the wording differs.
  const handleSave = async () => {
    advanceGuide('save-button');
    if (!isOutdated || saving) return;
    setSaving(true);
    try {
      await Promise.all([
        save(false, {silent: true}),
        new Promise(resolve => setTimeout(resolve, NOTICE_MIN_MS)),
      ]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {saving && <SavingPill message="Saving your map…" />}
      <HelpTip
        tip="saveStatus"
        openDelay={HELP_TIP_FAST_DELAY}
        text={
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
          className={`${isOutdated ? 'cursor-pointer' : ''} ${guiding ? 'ui-guide' : ''}`}
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
      </HelpTip>
    </>
  );
};
