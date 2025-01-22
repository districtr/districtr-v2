import {IconButtonProps} from '@radix-ui/themes';
import {ActiveTool} from '@constants/types';
import {useMapStore} from '@/app/store/mapStore';
import {
  EraserIcon,
  Pencil2Icon,
  HandIcon,
  LockOpen1Icon,
  ViewGridIcon,
  GearIcon,
  Cross2Icon,
  CounterClockwiseClockIcon,
  ResetIcon,
} from '@radix-ui/react-icons';
import {useTemporalStore} from '@/app/store/temporalStore';
import {useCallback} from 'react';
import {debounce} from 'lodash';

export type ActiveToolConfig = {
  hotkey: string;
  hotKeyLabel: string;
  mode: ActiveTool;
  disabled?: boolean;
  label: string;
  variant?: IconButtonProps['variant'];
  color?: IconButtonProps['color'];
  icon: React.JSX.Element;
  iconStyle?: React.CSSProperties;
  onClick?: () => void;
};

export const useActiveTools = () => {
  const mapDocument = useMapStore(state => state.mapDocument);

  const noZonesAreAssigned = useMapStore(state => !state.zoneAssignments.size);
  const {futureStates, pastStates, redo, undo} = useTemporalStore(state => state); // TemporalState<MapStore>
  const setIsTemporalAction = useMapStore(state => state.setIsTemporalAction);
  const handleUndo = useCallback(debounce(undo, 100), [undo]);
  const handleRedo = useCallback(debounce(redo, 100), [redo]);

  const config: ActiveToolConfig[] = [
    {
      hotkey: 'KeyM',
      hotKeyLabel: 'M',
      mode: 'pan',
      disabled: !mapDocument?.document_id,
      label: 'Move',
      icon: <HandIcon />,
    },
    {
      hotkey: 'KeyP',
      hotKeyLabel: 'P',
      mode: 'brush',
      disabled: !mapDocument?.document_id,
      label: 'Paint',
      icon: <Pencil2Icon />,
    },
    {
      hotkey: 'KeyE',
      hotKeyLabel: 'E',
      mode: 'eraser',
      disabled: !mapDocument?.document_id,
      label: 'Erase',
      icon: <EraserIcon />,
    },
    {
      hotkey: 'KeyZ',
      hotKeyLabel: 'Z',
      mode: 'undo',
      disabled: pastStates.length === 0,
      label: 'Undo',
      icon: <ResetIcon />,
      onClick: () => {
        setIsTemporalAction(true);
        handleUndo();
      },
    },
    {
      hotkey: 'KeyY',
      hotKeyLabel: 'Y',
      mode: 'undo',
      disabled: futureStates.length === 0,
      label: 'Redo',
      icon: <ResetIcon />,
      iconStyle: {transform: 'rotateY(180deg)'},
      onClick: () => {
        setIsTemporalAction(true);
        handleRedo();
      },
    },
    {
      hotkey: 'KeyB',
      hotKeyLabel: 'B',
      mode: 'shatter',
      disabled: !mapDocument?.child_layer,
      label: 'Break',
      icon: <ViewGridIcon />,
    },
    {
      hotkey: 'KeyL',
      hotKeyLabel: 'L',
      mode: 'lock',
      disabled: !mapDocument?.document_id,
      label: 'Lock',
      icon: <LockOpen1Icon />,
    }
  ];
  return config;
};
