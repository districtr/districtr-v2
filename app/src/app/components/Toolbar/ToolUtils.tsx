import {IconButtonProps, IconProps} from '@radix-ui/themes';
import {ActiveTool} from '@constants/types';
import {useMapStore} from '@/app/store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  LockOpen1Icon,
  ViewGridIcon,
  ResetIcon,
  ValueNoneIcon,
} from '@radix-ui/react-icons';
import {useTemporalStore} from '@/app/store/temporalStore';
import {useCallback} from 'react';
import {debounce} from 'lodash';

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
  const {futureStates, pastStates, redo, undo} = useTemporalStore(state => state); // TemporalState<MapStore>
  const setIsTemporalAction = useMapStore(state => state.setIsTemporalAction);
  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);
  const thereAreAssignments = useMapStore(state => state.zoneAssignments.size > 0);
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
      disabled:
        !mapDocument?.document_id ||
        mapDocument?.status === 'locked' ||
        mapDocument?.genesis === 'shared',
      label: 'Paint',
      icon: Pencil2Icon,
      hotKeyAccessor: e => {
        return e.code === 'KeyP';
      },
    },
    {
      hotKeyLabel: 'E',
      mode: 'eraser',
      disabled:
        !mapDocument?.document_id ||
        mapDocument?.status === 'locked' ||
        mapDocument?.genesis === 'shared',
      label: 'Erase',
      icon: EraserIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyE';
      },
    },
    {
      hotKeyLabel: `${metaKey} + Z`,
      mode: 'undo',
      disabled: pastStates.length === 0,
      label: 'Undo',
      icon: ResetIcon,
      onClick: () => {
        setIsTemporalAction(true);
        handleUndo();
      },
      hotKeyAccessor: e => {
        // command or control Z
        return (e.metaKey || e.ctrlKey) && !e.shiftKey && e.code === 'KeyZ';
      },
    },
    {
      hotKeyLabel: `${metaKey} + Shift + Z`,
      mode: 'undo',
      disabled: futureStates.length === 0,
      label: 'Redo',
      icon: ResetIcon,
      iconStyle: {transform: 'rotateY(180deg)'},
      onClick: () => {
        setIsTemporalAction(true);
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
      hotKeyLabel: 'L',
      mode: 'lock',
      disabled:
        !mapDocument?.document_id ||
        mapDocument?.status === 'locked' ||
        mapDocument?.genesis === 'shared',
      label: 'Lock',
      icon: LockOpen1Icon,
      hotKeyAccessor: e => {
        return e.code === 'KeyL';
      },
    },
    {
      hotKeyLabel: 'F',
      mode: 'zoomToUnassigned',
      disabled: !mapDocument?.document_id || !thereAreAssignments,
      label: 'Find Unassigned',
      icon: ValueNoneIcon,
      hotKeyAccessor: e => {
        return e.code === 'KeyF';
      },
    },
  ];
  if (mapDocument?.status === 'locked' || mapDocument?.genesis === 'shared') return [];
  return config;
};
