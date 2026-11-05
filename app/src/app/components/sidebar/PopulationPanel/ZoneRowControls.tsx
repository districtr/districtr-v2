'use client';
import {useState} from 'react';
import {Flex, Text, Tooltip} from '@radix-ui/themes';
import {DragHandleDots2Icon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {useChartStore} from '@store/chartStore';
import {useZoneLabel, useZoneOrder} from '@/app/hooks/useZoneLabel';
import {moveZoneInOrder} from '@utils/zoneLabels';
import {ZoneLabelField} from '@/app/components/ZoneDescriptions/ZoneLabelField';

/**
 * Drag-to-reorder for the district rows of the population meters and the tuning
 * table. A drop changes only the panel order (map_metadata.zone_order); the
 * districts' numbers and assignments stay as they are. Colors move with the
 * districts unless the chart's popColorsFollowDistricts option is off.
 */
export const useZoneRowDrag = () => {
  const order = useZoneOrder();
  const [dragZone, setDragZone] = useState<number | null>(null);
  const [dropZone, setDropZone] = useState<number | null>(null);
  const endDrag = () => {
    setDragZone(null);
    setDropZone(null);
  };
  /** Where the dragged district would land on this row: a line on that edge. */
  const dropEdge = (zone: number): 'top' | 'bottom' | null =>
    dragZone !== null && dropZone === zone && dragZone !== zone
      ? order.indexOf(dragZone) < order.indexOf(zone)
        ? 'bottom'
        : 'top'
      : null;
  const rowProps = (zone: number) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragZone === null) return;
      e.preventDefault();
      setDropZone(zone);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragZone !== null) {
        useMapStore.getState().setZoneOrder(moveZoneInOrder(order, dragZone, zone), {
          colorsFollow: useChartStore.getState().chartOptions.popColorsFollowDistricts,
        });
      }
      endDrag();
    },
  });
  const rowStyle = (zone: number): React.CSSProperties => {
    const edge = dropEdge(zone);
    return {
      opacity: dragZone === zone ? 0.5 : 1,
      boxShadow: edge ? `inset 0 ${edge === 'top' ? 2 : -2}px 0 var(--accent-9)` : undefined,
    };
  };
  return {dragZone, setDragZone, endDrag, rowProps, rowStyle};
};

export const ZONE_DRAG_HANDLE_WIDTH = 15;

/** The grip that starts a row drag. Shown on the selected row, or on hover. */
export const ZoneDragHandle: React.FC<{
  zone: number;
  selected: boolean;
  /** Matches the row element, which becomes the drag image. */
  rowSelector: string;
  onDragStart: (zone: number) => void;
  onDragEnd: () => void;
}> = ({zone, selected, rowSelector, onDragStart, onDragEnd}) => {
  const label = useZoneLabel(zone);
  return (
    <Tooltip content="Drag to reorder">
      <Flex
        draggable
        role="img"
        aria-label={`Drag to reorder district ${label}`}
        className={`cursor-grab text-[var(--gray-9)] transition-opacity duration-200 ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{width: ZONE_DRAG_HANDLE_WIDTH, flexShrink: 0}}
        onClick={e => e.stopPropagation()}
        onDragStart={e => {
          // Firefox won't start a drag without data.
          e.dataTransfer.setData('text/plain', label);
          e.dataTransfer.effectAllowed = 'move';
          const row = e.currentTarget.closest<HTMLElement>(rowSelector);
          if (row) e.dataTransfer.setDragImage(row, 8, row.offsetHeight / 2);
          onDragStart(zone);
        }}
        onDragEnd={onDragEnd}
      >
        <DragHandleDots2Icon />
      </Flex>
    </Tooltip>
  );
};

/**
 * A district's label at the start of its row. When `editable`, clicking it
 * (which also selects the row) turns it into a field.
 */
export const ZoneRowLabel: React.FC<{
  zone: number;
  editable: boolean;
  /** Inherits the surrounding size when unset. */
  size?: React.ComponentProps<typeof Text>['size'];
  color?: React.ComponentProps<typeof Text>['color'];
  weight?: React.ComponentProps<typeof Text>['weight'];
  style?: React.CSSProperties;
  /** Width of the field while editing. */
  fieldWidth?: string | number;
}> = ({zone, editable, size, color, weight, style, fieldWidth = '12ch'}) => {
  const label = useZoneLabel(zone);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <ZoneLabelField
        zone={zone}
        autoFocus
        onDone={() => setEditing(false)}
        style={{width: fieldWidth, flexShrink: 0}}
      />
    );
  }
  const text = (
    <Text
      size={size}
      color={color}
      weight={weight}
      title={label}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...(!editable && style),
      }}
    >
      {label}
    </Text>
  );
  if (!editable) return text;
  return (
    <Tooltip content="Click to rename">
      <button
        type="button"
        aria-label={`Rename district ${label}`}
        className="min-w-0 cursor-text rounded-sm hover:bg-[var(--gray-a3)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-8)]"
        style={{display: 'flex', justifyContent: 'flex-end', minWidth: 0, ...style}}
        onClick={() => setEditing(true)}
      >
        {text}
      </button>
    </Tooltip>
  );
};
