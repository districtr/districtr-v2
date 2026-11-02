import {IconButtonProps, IconProps} from '@radix-ui/themes';
import {ACTIVE_TOOLS, SUPER_DRAW_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useMapStore} from '@/app/store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  ViewGridIcon,
  MaskOnIcon,
  ResetIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons';
import {useMemo, useRef} from 'react';
import {debounce} from 'lodash';
import {useTemporalStore, useCoiTemporalStore} from '@/app/store/temporalStore';
import {selectShownTool, useMapControlsStore} from '@/app/store/mapControlsStore';
import {setPaintBy} from '@utils/map/paintBy';
import {isAreaPaintInFlight} from '@utils/map/paintOverlayArea';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {MAP_MODES} from '@constants/map/mode';
import {ACCESS_STATES} from '@constants/document/state';
import type {HelpTipKey} from '@/app/components/HelpTip/helpTipContent';

export type ActiveToolConfig = {
  hotKeyAccessor: (event: KeyboardEvent) => boolean;
  hotKeyLabel: string;
  mode: ActiveTool;
  disabled?: boolean;
  label: string;
  variant?: IconButtonProps['variant'];
  color?: IconButtonProps['color'];
  icon: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
  iconStyle?: React.CSSProperties;
  onClick?: () => void;
  /** What the hotkey does when it differs from a click: select, never toggle off. */
  onHotkey?: () => void;
  /** Overrides "activeTool is this mode" for the pressed look (Paint vs Break). */
  isActive?: boolean;
  helpKey?: HelpTipKey;
};

export const useActiveTools = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const isEditing = access === ACCESS_STATES.EDIT;
  const districtsHidden = useMapControlsStore(
    state => state.mapOptions.showPaintedDistricts === false
  );
  const mapMode = useMapControlsStore(state => state.mapMode);
  const superDraw = useToolbarStore(state => state.superDraw);
  const paintBy = useMapControlsStore(state => state.mapOptions.paintBy);
  const shownTool = useMapControlsStore(selectShownTool);
  const setActiveTool = useMapControlsStore(state => state.setActiveTool);

  const districtsTemporal = useTemporalStore();
  const coiTemporal = useCoiTemporalStore();
  const {futureStates, pastStates, redo, undo} =
    mapMode === MAP_MODES.COI ? coiTemporal : districtsTemporal;

  // One debounce instance for the component lifetime (the store returns fresh
  // undo/redo wrappers every render, which would otherwise defeat debouncing);
  // refs keep it pointed at the latest wrappers.
  const undoRef = useRef(undo);
  const redoRef = useRef(redo);
  undoRef.current = undo;
  redoRef.current = redo;
  // Not mid area-paint: its break and paint must land as one step first.
  const handleUndo = useMemo(
    () => debounce(() => !isAreaPaintInFlight() && undoRef.current(), 100),
    []
  );
  const handleRedo = useMemo(
    () => debounce(() => !isAreaPaintInFlight() && redoRef.current(), 100),
    []
  );
  const metaKey =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  // Pan, paint, and erase exist in both Draw and Super Draw, so their shared
  // help entry flips with the mode — the same combination key Inspector
  // always uses, since it only ever exists in Super Draw.
  const combinationHelpKey = superDraw ? 'superdrawToolsCombination' : 'drawToolsCombination';
  const paintByBlocks = paintBy === 'blocks';
  const breakActive = paintByBlocks && shownTool === ACTIVE_TOOLS.BRUSH;
  const paintActive = !paintByBlocks && shownTool === ACTIVE_TOOLS.BRUSH;
  // Paint leaves Paint by blocks only when Break is the pressed tool: from
  // Erase (or Move) inside Paint by blocks it goes back to painting blocks.
  const selectPaint = () => {
    if (breakActive) setPaintBy('units');
    setActiveTool(ACTIVE_TOOLS.BRUSH);
  };
  const selectBreak = () => {
    setPaintBy('blocks');
    setActiveTool(ACTIVE_TOOLS.BRUSH);
  };

  const config: ActiveToolConfig[] = [
    {
      hotKeyLabel: 'M',
      mode: ACTIVE_TOOLS.PAN,
      disabled: !mapDocument?.document_id,
      label: 'Move',
      icon: HandIcon,
      helpKey: combinationHelpKey,
      hotKeyAccessor: e => {
        return e.code === 'KeyM';
      },
    },
    {
      hotKeyLabel: 'P',
      mode: ACTIVE_TOOLS.BRUSH,
      disabled: !mapDocument?.document_id || !isEditing || districtsHidden,
      label: 'Paint',
      icon: Pencil2Icon,
      helpKey: combinationHelpKey,
      // Break is Paint by blocks, so Paint shows pressed for the other Paint bys.
      isActive: paintActive,
      onClick: () => (paintActive ? setActiveTool(ACTIVE_TOOLS.PAN) : selectPaint()),
      onHotkey: () => selectPaint(),
      hotKeyAccessor: e => {
        return e.code === 'KeyP';
      },
    },
    {
      hotKeyLabel: 'E',
      mode: ACTIVE_TOOLS.ERASER,
      disabled: !mapDocument?.document_id || !isEditing || districtsHidden,
      label: 'Erase',
      icon: EraserIcon,
      helpKey: combinationHelpKey,
      hotKeyAccessor: e => {
        return e.code === 'KeyE';
      },
    },
    {
      hotKeyLabel: `${metaKey} + Z`,
      mode: ACTIVE_TOOLS.UNDO,
      disabled: pastStates.length === 0 || !isEditing,
      label: 'Undo',
      icon: ResetIcon,
      // Same helpKey as Redo: one explanation covers the pair.
      helpKey: 'undoRedo',
      onClick: () => {
        handleUndo();
      },
      hotKeyAccessor: e => {
        // command or control Z
        return (e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ';
      },
    },
    {
      hotKeyLabel: `${metaKey} + Shift + Z`,
      mode: ACTIVE_TOOLS.REDO,
      disabled: futureStates.length === 0 || !isEditing,
      label: 'Redo',
      icon: ResetIcon,
      iconStyle: {transform: 'rotateY(180deg)'},
      helpKey: 'undoRedo',
      onClick: () => {
        handleRedo();
      },
      hotKeyAccessor: e => {
        // command or control AND shift + y
        return (e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyZ';
      },
    },
    {
      hotKeyLabel: 'B',
      mode: ACTIVE_TOOLS.SHATTER,
      disabled: !mapDocument?.child_layer || !isEditing || districtsHidden,
      label: 'Break',
      icon: ViewGridIcon,
      helpKey: 'superdrawToolsCombination',
      // A shortcut to Paint by blocks: Paint picks a unit to break, then
      // paints its blocks (setActiveTool's picking rule).
      isActive: breakActive,
      onClick: () => {
        if (!breakActive) return selectBreak();
        setPaintBy('units');
        setActiveTool(ACTIVE_TOOLS.PAN);
      },
      onHotkey: () => selectBreak(),
      hotKeyAccessor: e => {
        return e.code === 'KeyB';
      },
    },
    {
      hotKeyLabel: 'K',
      mode: ACTIVE_TOOLS.MASK,
      disabled: !mapDocument?.document_id || !isEditing,
      label: 'Mask',
      icon: MaskOnIcon,
      helpKey: 'paintMask',
      hotKeyAccessor: e => {
        return e.code === 'KeyK';
      },
    },
    {
      hotKeyLabel: 'I',
      mode: ACTIVE_TOOLS.INSPECTOR,
      label: 'Inspect',
      icon: MagnifyingGlassIcon,
      // Only ever rendered in Super Draw (filtered below), so no mode branch needed.
      helpKey: 'superdrawToolsCombination',
      hotKeyAccessor: e => {
        return e.code === 'KeyI';
      },
    },
  ];
  // Filtering (rather than disabling) also removes the tools' hotkeys, since the
  // toolbar's key handler only checks the tools returned here.
  return superDraw ? config : config.filter(t => !SUPER_DRAW_TOOLS.includes(t.mode));
};
