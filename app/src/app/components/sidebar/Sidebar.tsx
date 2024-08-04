import { MapModeSelector } from "./MapModeSelector";
import { ColorPicker } from "./ColorPicker";

export default function SidebarComponent() {
  return (
    <div className="h-full w-sidebar m-3 pt-3 py-1.5">
      <div className="flex flex-col py-1.5">
        <MapModeSelector />
      </div>
      <div className="flex flex-col items-center py-1.5">
        <ColorPicker />
      </div>
    </div>
  );
}
