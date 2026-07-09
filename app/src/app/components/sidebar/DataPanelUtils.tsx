import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapControlsStore} from '@/app/store/mapControlsStore';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import OverlaysPanel from './OverlaysPanel';
import {SUMMARY_TYPES} from '@constants/demography/summary';

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
    label: 'Population',
    content: <PopulationPanel />,
  },
  {
    title: 'demography',
    label: 'Demographics',
    content: (
      <SummaryPanel
        defaultColumnSet={SUMMARY_TYPES.TOTPOP}
        displayedColumnSets={[SUMMARY_TYPES.TOTPOP, SUMMARY_TYPES.VAP]}
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
    label: 'Validity check',
    content: <MapValidation />,
  },
  {
    title: 'overlays',
    label: 'Overlays',
    content: <OverlaysPanel />,
  },
];
