import Evaluation from '@/app/components/sidebar/Evaluation/Evaluation';
import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapStore} from '@/app/store/mapStore';
import { DemographicMapPanel } from './DemographicMapPanel';
import { MapValidation } from './MapValidation/MapValidation';

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
    title: 'evaluation',
    label: 'Evaluation',
    content: <Evaluation />,
  },
  {
    title: "demography",
    label: "Demographic Map",
    content: <DemographicMapPanel />
  },
  {
    title: 'mapValidation',
    label: 'Map Validation',
    content: <MapValidation />
  }
];