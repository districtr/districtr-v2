import PopulationPanel from '@components/sidebar/PopulationPanel';
import {MapControlsStore} from '@/app/store/mapControlsStore';
import {COLUMN_SETS} from '@/app/constants/demography';
import {SIDEBAR_PANELS} from '@/app/constants/sidebar';
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
    title: SIDEBAR_PANELS.POPULATION,
    label: 'Districts',
    content: <PopulationPanel />,
  },
  {
    title: SIDEBAR_PANELS.DEMOGRAPHY,
    label: 'Demographics',
    content: (
      <SummaryPanel
        defaultColumnSet={COLUMN_SETS.VAP}
        displayedColumnSets={[COLUMN_SETS.VAP, COLUMN_SETS.TOTPOP]}
      />
    ),
  },
  {
    title: SIDEBAR_PANELS.ELECTION,
    label: 'Elections',
    content: (
      <SummaryPanel
        defaultColumnSet={COLUMN_SETS.VOTERHISTORY}
        displayedColumnSets={[COLUMN_SETS.VOTERHISTORY]}
      />
    ),
  },
  {
    title: SIDEBAR_PANELS.MAP_VALIDATION,
    label: 'Map validation',
    content: <MapValidation />,
  },
  {
    title: SIDEBAR_PANELS.OVERLAYS,
    label: 'Overlays',
    content: <OverlaysPanel />,
  },
];
