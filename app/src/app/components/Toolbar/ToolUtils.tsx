import {IconButtonProps, IconProps} from '@radix-ui/themes';
import {ACTIVE_TOOLS, type ActiveTool} from '@constants/map/tools';
import {useMapStore} from '@/app/store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  ViewGridIcon,
  ResetIcon,
  MagnifyingGlassIcon,
} from '@radix-ui/react-icons';
import {useCallback} from 'react';
import {debounce} from 'lodash';
import {useTemporalStore, useCoiTemporalStore} from '@/app/store/temporalStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {MAP_MODES} from '@constants/map/mode';

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
};

export const useActiveTools = () => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const access = useMapStore(state => state.mapStatus?.access);
  const isEditing = access === 'edit';
  const mapMode = useMapControlsStore(state => state.mapMode);

  const districtsTemporal = useTemporalStore();
  const coiTemporal = useCoiTemporalStore();
  const {futureStates, pastStates, redo, undo} =
    mapMode === MAP_MODES.COI ? coiTemporal : districtsTemporal;

  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);
  const metaKey =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  const config: ActiveToolConfig[] = [
    {
      hotKeyLabel: 'M',
      mode: ACTIVE_TOOLS.PAN,
      disabled: !mapDocument?.document_id,
      label: 'Move',
      icon: HandIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyM';
      },
    },
    {
      hotKeyLabel: 'P',
      mode: ACTIVE_TOOLS.BRUSH,
      disabled: !mapDocument?.document_id || !isEditing,
      label: 'Paint',
      icon: Pencil2Icon,
      hotKeyAccessor: e => {
        return e.code === 'KeyP';
      },
    },
    {
      hotKeyLabel: 'E',
      mode: ACTIVE_TOOLS.ERASER,
      disabled: !mapDocument?.document_id || !isEditing,
      label: 'Erase',
      icon: EraserIcon,
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
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: ViewGridIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyB';
      },
    },
    {
      hotKeyLabel: 'I',
      mode: ACTIVE_TOOLS.INSPECTOR,
      label: 'Inspector',
      icon: MagnifyingGlassIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyI';
      },
    },
  ];
  return config;
};
