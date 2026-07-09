'use client';
import React from 'react';
import {Button, DropdownMenu, Flex, Spinner, Text} from '@radix-ui/themes';
import {
  BarChartIcon,
  CaretDownIcon,
  CheckIcon,
  EyeOpenIcon,
  LockClosedIcon,
  Pencil1Icon,
} from '@radix-ui/react-icons';
import {useRouter, useSearchParams} from 'next/navigation';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';
import {routeForMode} from '@constants/document/routes';
import {ACCESS_STATES} from '@constants/document/state';
import {useEditableDocId} from '@/app/hooks/useEditableDocId';
import {useMapSaveStatus} from '@/app/hooks/useMapSaveStatus';
import {patchSharePlan} from '@/app/utils/api/apiHandlers/patchSharePlan';
import {idb} from '@/app/utils/idb/idb';

type ViewMode = 'edit' | 'display' | 'evaluate';

const MODE_META: Record<
  ViewMode,
  {label: string; Icon: React.ComponentType<{className?: string}>}
> = {
  edit: {label: 'Draw', Icon: Pencil1Icon},
  display: {label: 'View', Icon: EyeOpenIcon},
  evaluate: {label: 'Evaluate', Icon: BarChartIcon},
};

/** A single mode option in the switcher menu. Owns its own icon/description so the
 * switcher template stays declarative. `locked` is the password-gated edit state. */
const ModeSwitcherItem: React.FC<{
  mode: ViewMode;
  isCurrent: boolean;
  disabled: boolean;
  disabledReason: string;
  locked: boolean;
  onSelect: () => void;
}> = ({mode, isCurrent, disabled, disabledReason, locked, onSelect}) => {
  const meta = MODE_META[mode];
  const Icon = locked ? LockClosedIcon : meta.Icon;
  return (
    <DropdownMenu.Item disabled={disabled} onSelect={onSelect}>
      <Flex align="center" justify="between" gap="4" width="100%" py="1">
        <Flex align="center" gap="3">
          <Icon className="size-4 shrink-0" />
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              {meta.label}
            </Text>
          </Flex>
        </Flex>
        {isCurrent && <CheckIcon className="shrink-0" />}
      </Flex>
    </DropdownMenu.Item>
  );
};

/**
 * Google Docs–style view-mode switcher for the map topbar. Lets the user move
 * fluently between Editing, Display, and Evaluate for the current map.
 *
 * The three views are route-based: Edit uses the document_id (UUID); Display and
 * Evaluate use the public_id. A public_id is minted only when a map is shared, so
 * when an editor switches to Display/Evaluate on an unshared draft we transparently
 * mint a read-only public_id first (no prompt) and then navigate.
 */
export const ModeSwitcher: React.FC = () => {
  const router = useRouter();
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const mutateMapDocument = useMapStore(state => state.mutateMapDocument);
  const setNotification = useMapStore(state => state.setNotification);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const isEval = useMapControlsStore(state => state.isEval);
  const mapMode = useMapControlsStore(state => state.mapMode);
  const editDocId = useEditableDocId();
  const {isOutdated, save} = useMapSaveStatus();
  const setViewTransition = useMapControlsStore(state => state.setViewTransition);
  const passwordUnlockable = useMapControlsStore(state => state.passwordUnlockable);
  const setPasswordUnlockable = useMapControlsStore(state => state.setPasswordUnlockable);
  const setPasswordPrompt = useMapStore(state => state.setPasswordPrompt);
  const setLoadingState = useMapStore(state => state.setLoadingState);
  const publicIdForLookup = useMapStore(state => state.mapDocument?.public_id ?? null);
  const pwParam = useSearchParams().get('pw');
  const [isMinting, setIsMinting] = React.useState(false);

  // A map is unlockable if the share link carries `?pw=true` or the document itself
  // reports an edit password (so a viewer who landed on the bare public URL still gets
  // the affordance). Remember it so it survives dismissing the prompt or switching views.
  const passwordRequired = mapDocument?.password_required;
  React.useEffect(() => {
    if (pwParam || passwordRequired) setPasswordUnlockable(true);
  }, [pwParam, passwordRequired, publicIdForLookup, setPasswordUnlockable]);

  // No map loaded yet (e.g. the empty "start here" landing) — nothing to switch.
  if (!mapDocument) return null;

  const currentMode: ViewMode = isEval ? 'evaluate' : isEditing ? 'edit' : 'display';
  // COI has no evaluation route/view.
  const modes: ViewMode[] =
    mapMode === MAP_MODES.COI ? ['edit', 'display'] : ['edit', 'display', 'evaluate'];
  const prefix = routeForMode(mapMode);

  const publicId = mapDocument.public_id ?? null;
  const canEdit = access === ACCESS_STATES.EDIT;
  const isUnlockable = passwordUnlockable;
  // Edit is reachable but gated behind a password (no local copy): show the unlock
  // affordance instead of routing straight into the editor.
  const editLocked = !editDocId && isUnlockable;

  const targetFor = (mode: ViewMode): string | null => {
    switch (mode) {
      case 'edit':
        return editDocId ? `/${prefix}/edit/${editDocId}` : null;
      case 'display':
        return publicId ? `/${prefix}/${publicId}` : null;
      case 'evaluate':
        return publicId ? `/map/eval/${publicId}` : null;
    }
  };

  const isDisabled = (mode: ViewMode): boolean => {
    if (mode === currentMode) return false;
    if (mode === 'edit') return !editDocId && !isUnlockable;
    // display / evaluate: available once a public_id exists; otherwise only an
    // editor can reach them (we mint a public_id on the fly).
    if (publicId) return false;
    return !canEdit;
  };

  const disabledReasonFor = (mode: ViewMode): string =>
    mode === 'edit' ? "You don't have edit access" : 'Unavailable for this map';

  /** Editor switching to display/evaluate on an unshared draft: mint a read-only
   * public_id, persist it, and return the freshly-resolved target route. */
  const mintAndResolve = async (mode: 'display' | 'evaluate'): Promise<string | null> => {
    if (!editDocId) return null;
    setIsMinting(true);
    try {
      const resp = await patchSharePlan({
        document_id: editDocId,
        password: null,
        access_type: ACCESS_STATES.READ,
      });
      if (!resp.ok) {
        setNotification({message: resp.error.detail, importance: 2, type: 'error'});
        return null;
      }
      const newPublicId = resp.response.public_id;
      mutateMapDocument({public_id: newPublicId});
      // Persist so reloads and the My-Maps list reflect the new public_id.
      const nextDoc = useMapStore.getState().mapDocument;
      if (nextDoc) idb.updateIdbDocumentMetadata(nextDoc);
      return mode === 'evaluate' ? `/map/eval/${newPublicId}` : `/${prefix}/${newPublicId}`;
    } finally {
      setIsMinting(false);
    }
  };

  const handleSelect = async (mode: ViewMode) => {
    if (mode === currentMode || isDisabled(mode)) return;
    // Edit: route straight in when we hold the UUID; otherwise unlock with a password.
    if (mode === 'edit') {
      if (editDocId) {
        router.push(`/${prefix}/edit/${editDocId}`);
      } else if (isUnlockable) {
        setPasswordPrompt(true);
      }
      return;
    }
    // Persist any pending edits first so the read-only view reflects the latest map.
    // Show the transition overlay up front so the auto-save is visible — LoadingOverlay
    // renders it as "Saving changes…" while the save runs, then the normal transition.
    const needsSave = isOutdated && canEdit;
    if (needsSave) {
      // Reset the destination's load flags first so the transition overlay isn't
      // immediately cleared (useViewTransition clears it once data is "ready"), then
      // show it while the save runs — LoadingOverlay renders it as "Saving changes…".
      setLoadingState('publicSourceLoaded', false);
      setLoadingState('metricsLoaded', false);
      setViewTransition(mode);
      await save();
    }
    let target = targetFor(mode);
    if (!target && canEdit) {
      target = await mintAndResolve(mode);
    }
    if (!target) {
      if (needsSave) setViewTransition(null);
      return;
    }
    // Reset the destination's load flags and show the overlay, then navigate
    // immediately so the overlay covers the real load and only clears once the
    // destination view's data has loaded (see LoadingOverlay / useViewTransition).
    setLoadingState('publicSourceLoaded', false);
    setLoadingState('metricsLoaded', false);
    setViewTransition(mode);
    router.push(target);
  };

  const CurrentIcon = MODE_META[currentMode].Icon;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button
          variant="surface"
          color="gray"
          size="2"
          className="cursor-pointer transition-shadow hover:shadow-md"
          disabled={isMinting}
          aria-label="Switch view"
        >
          {isMinting ? <Spinner size="1" /> : <CurrentIcon />}
          Mode: {MODE_META[currentMode].label}
          <CaretDownIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        sideOffset={6}
        className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {modes.map(mode => (
          <ModeSwitcherItem
            key={mode}
            mode={mode}
            isCurrent={mode === currentMode}
            disabled={isDisabled(mode)}
            disabledReason={disabledReasonFor(mode)}
            locked={mode === 'edit' && editLocked}
            onSelect={() => handleSelect(mode)}
          />
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
