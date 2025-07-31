'use client';
import {Button, CheckboxGroup, Flex, Heading, SegmentedControl, Tabs, Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import React, {useEffect, useRef} from 'react';
import {BrushControls} from '@components/BrushControls';
import {ActiveTool} from '@constants/types';
import {ExitBlockViewButtons} from '@/app/components/Toolbar/ExitBlockViewButtons';
import {useToolbarStore} from '@/app/store/toolbarStore';
import {TooltipStore, useTooltipStore} from '@/app/store/tooltipStore';
import {
  CONFIG_BY_COLUMN_SET,
  summaryStatLabels,
  TOTPOPColumnConfig,
  VAPColumnConfig,
} from '@/app/store/demography/evaluationConfig';
import {useDemographyStore} from '@/app/store/demography/demographyStore';
import {KeyOfSummaryStatConfig, SummaryStatConfig} from '@/app/utils/api/summaryStats';
import {demographyCache} from '@/app/utils/demography/demographyCache';
import {choroplethMapVariables} from '@/app/store/demography/constants';

const ToolControlsConfig: Record<
  Partial<ActiveTool>,
  {Component?: () => React.JSX.Element; focused?: boolean}
> = {
  pan: {},
  undo: {
    Component: () => <React.Fragment />,
  },
  redo: {
    Component: () => <React.Fragment />,
  },
  brush: {
    Component: BrushControls,
  },
  eraser: {
    Component: BrushControls,
  },
  shatter: {
    Component: () => {
      const focusFeatures = useMapStore(state => state.focusFeatures);
      if (focusFeatures.length) {
        return <Text>Focused on {focusFeatures[0].id}</Text>;
      } else {
        return <Text>Click a feature to show the census blocks within it</Text>;
      }
    },
  },
  inspector: {
    Component: () => {
      const inspectorMode = useTooltipStore(state => state.inspectorMode);
      const activeColumns = useTooltipStore(state => state.activeColumns);
      const setInspectorMode = useTooltipStore(state => state.setInspectorMode);
      const setActiveColumns = useTooltipStore(state => state.setActiveColumns);

      const columnList = CONFIG_BY_COLUMN_SET[inspectorMode]
        .filter(f => demographyCache.availableColumns.includes(f.sourceCol ?? f.column))
        .sort((a, b) => a.label.localeCompare(b.label));

      const totalColumn = {
        VAP: ['total_vap_20'],
        TOTPOP: ['total_pop_20'],
        VOTERHISTORY: [],
      }[inspectorMode];

      useEffect(() => {
        setActiveColumns([...totalColumn, ...columnList.map(f => f.column)]);
      }, [inspectorMode, setActiveColumns]);

      return (
        <Flex direction="column">
          <BrushControls />
          <Heading as="h3" size="3">
            Inspector mode
          </Heading>
          <Flex direction="row" className="" wrap="wrap" gap="1">
            <Button
              variant="soft"
              color={inspectorMode === 'VAP' ? 'blue' : 'gray'}
              radius="none"
              onClick={() => setInspectorMode('VAP')}
            >
              Voting Age Population
            </Button>
            <Button
              variant="soft"
              color={inspectorMode === 'TOTPOP' ? 'blue' : 'gray'}
              radius="none"
              onClick={() => setInspectorMode('TOTPOP')}
            >
              Total Population
            </Button>
            <Button
              variant="soft"
              color={inspectorMode === 'VOTERHISTORY' ? 'blue' : 'gray'}
              radius="none"
              onClick={() => setInspectorMode('VOTERHISTORY')}
            >
              Voter History
            </Button>
          </Flex>
          <Flex direction="column" py="4" gap="2">
            <Heading as="h3" size="3">
              Inspector columns
            </Heading>
            <CheckboxGroup.Root
              defaultValue={[]}
              value={activeColumns}
              onValueChange={value => {
                setActiveColumns([...value, ...totalColumn]);
              }}
              name="example"
            >
              {columnList.map(f => (
                <CheckboxGroup.Item value={f.column} key={f.column}>
                  {f.label}
                </CheckboxGroup.Item>
              ))}
            </CheckboxGroup.Root>
          </Flex>
        </Flex>
      );
    },
  },
};

export const ToolControls: React.FC<{
  isMobile?: boolean;
}> = ({isMobile}) => {
  const {Component} = useMapStore(state => ToolControlsConfig[state.activeTool] || {});
  const {x, y, maxXY, rotation, customizeToolbar, toolbarLocation, toolbarWidth, toolbarHeight} =
    useToolbarStore();
  const isHorizontal =
    toolbarLocation === 'sidebar' || !customizeToolbar || rotation === 'horizontal';
  const ContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldFlip =
    rotation === 'horizontal' ? (y ?? 0) < 200 : (x ?? 0) > (maxXY?.maxX ?? 0) - 200;

  if (!Component) {
    return null;
  }
  return (
    <div
      ref={ContainerRef}
      style={{
        bottom: isHorizontal ? (shouldFlip ? undefined : '100%') : undefined,
        top: isHorizontal ? (shouldFlip ? '100%' : undefined) : '12px',
        left: isHorizontal ? '12px' : shouldFlip ? 'undefined' : '100%',
        right: isHorizontal ? 0 : shouldFlip ? '100%' : undefined,
        minWidth: isHorizontal ? 'calc(100% - 24px)' : 'min(20rem, 30vw)',
      }}
      className={`bg-white w-full ${toolbarLocation === 'sidebar' ? '' : 'absolute shadow-sm border-[1px] border-gray-500 overflow-hidden'} p-4 `}
    >
      <Component />
      <ExitBlockViewButtons />
    </div>
  );
};
