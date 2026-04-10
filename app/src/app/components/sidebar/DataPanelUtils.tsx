import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapControlsStore} from '@/app/store/mapControlsStore';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import OverlaysPanel from './OverlaysPanel';
import {SUMMARY_TYPES} from '@constants/types';

export interface DataPanelSpec {
  title: MapControlsStore['sidebarPanels'][number];
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

export interface DataPanelsProps {
  panels?: DataPanelSpec[];
}

export const defaultPanels: DataPanelSpec[] = [
  {
    title: 'population',
    label: 'Districts',
    content: <PopulationPanel />,
  },
  {
    title: 'demography',
    label: 'Demographics',
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VAP}
        displayedColumnSets={[SUMMARY_TYPES.VAP, SUMMARY_TYPES.TOTPOP]}
      />
    ),
  },
  {
    title: 'election',
    label: 'Elections',
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.VOTERHISTORY}
        displayedColumnSets={[SUMMARY_TYPES.VOTERHISTORY]}
      />
    ),
  },
  {
    title: 'mapValidation',
    label: 'Map validation',
    content: <MapValidation />,
  },
  {
    title: 'overlays',
    label: 'Overlays',
    content: <OverlaysPanel />,
  },
];
