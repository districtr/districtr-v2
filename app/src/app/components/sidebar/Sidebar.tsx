import { ZoneTypeSelector } from "./Picker";
import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";

export default function SidebarComponent() {
  return (
    <div className="h-full w-sidebar m-3 pt-3">
      <ZoneTypeSelector />
      <MapModeSelector />
      <ColorPicker />
    </div>
  );
}
