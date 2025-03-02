import Evaluation from '@components/sidebar/Evaluation';
import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapStore} from '@/app/store/mapStore';
import { Contiguity } from './Contiguity/Contiguity';

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
    title: 'contiguity',
    label: 'Contiguity',
    content: <Contiguity />
  }
];