import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapStore} from '@/app/store/mapStore';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';

export interface DataPanelSpec {
  title: MapStore['sidebarPanels'][number];
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
    label: 'Demographic evaluation',
    content: <SummaryPanel defaultColumnSet="VAP" displayedColumnSets={['VAP', 'TOTPOP']} />,
  },
  {
    title: 'election',
    label: 'Election details',
    content: (
      <SummaryPanel defaultColumnSet="VOTERHISTORY" displayedColumnSets={['VOTERHISTORY']} />
    ),
  },
  {
    title: 'mapValidation',
    label: 'Map validation',
    content: <MapValidation />,
  },
];
