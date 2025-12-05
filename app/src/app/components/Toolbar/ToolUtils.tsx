import {IconButtonProps, IconProps} from '@radix-ui/themes';
import {ActiveTool} from '@constants/types';
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
import {useTemporalStore} from '@/app/store/temporalStore';

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

  const {futureStates, pastStates, redo, undo} = useTemporalStore();

  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);
  const metaKey =
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';

  const config: ActiveToolConfig[] = [
    {
      hotKeyLabel: 'M',
      mode: 'pan',
      disabled: !mapDocument?.document_id,
      label: 'Move',
      icon: HandIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyM';
      },
    },
    {
      hotKeyLabel: 'P',
      mode: 'brush',
      disabled: !mapDocument?.document_id || !isEditing,
      label: 'Paint',
      icon: Pencil2Icon,
      hotKeyAccessor: e => {
        return e.code === 'KeyP';
      },
    },
    {
      hotKeyLabel: 'E',
      mode: 'eraser',
      disabled: !mapDocument?.document_id || !isEditing,
      label: 'Erase',
      icon: EraserIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyE';
      },
    },
    {
      hotKeyLabel: `${metaKey} + Z`,
      mode: 'undo',
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
      mode: 'redo',
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
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: ViewGridIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyB';
      },
    },
    {
      hotKeyLabel: 'I',
      mode: 'inspector',
      label: 'Inspector',
      icon: MagnifyingGlassIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyI';
      },
    },
  ];
  if (!isEditing) return [];
  return config;
};
