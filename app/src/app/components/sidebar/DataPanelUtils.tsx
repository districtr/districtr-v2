import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapControlsStore} from '@/app/store/mapControlsStore';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import OverlaysPanel from './OverlaysPanel';

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
    content: <SummaryPanel defaultColumnSet="VAP" displayedColumnSets={['VAP', 'TOTPOP']} />,
  },
  {
    title: 'election',
    label: 'Elections',
    content: (
      <SummaryPanel defaultColumnSet="VOTERHISTORY" displayedColumnSets={['VOTERHISTORY']} />
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
