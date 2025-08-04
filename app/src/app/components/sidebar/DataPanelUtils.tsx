import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapStore} from '@/app/store/mapStore';
import {MapValidation} from './MapValidation/MapValidation';
import {SummaryPanel} from './SummaryPanel';
import { MetadataPanel } from './MetadataPanel';

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
    title: 'metadata',
    label: 'Map Comments and Metadata',
    content: <MetadataPanel />,
  },
];
