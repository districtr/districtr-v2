"use client";
import { MapComponent } from "./components/Map";
import { ZoneTypeSelector } from "./components/Picker";
import SidebarComponent from "./components/Sidebar";

export default function Home() {
  return (
    <main>
      <div className="h-screen w-screen flex items-center justify-between p">
        <MapComponent />
        <SidebarComponent />
      </div>
    </main>
  );
}
