import {MapControlsStore} from '@/app/store/mapControlsStore';
import {SECTIONS} from './DataCards';

export interface DataPanelSpec {
  title: MapControlsStore['sidebarPanels'][number];
  label: string;
  icon?: React.ReactNode;
  content?: React.ReactNode;
}

// Derived from the sidebar's SECTIONS registry so desktop and mobile can't
// drift on labels or content.
export const defaultPanels: DataPanelSpec[] = SECTIONS.map(section => ({
  title: section.key,
  label: section.label,
  content: section.content,
}));
