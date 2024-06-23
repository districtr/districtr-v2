"use client";
import Head from "next/head";
import { MapComponent } from "./components/Map";
import ZoneTypeSelector from "./components/Picker";
export default function Home() {
  return (
    <main className="flex   items-center justify-between p">
      <div className="h-screen w-screen ">
        <ZoneTypeSelector />
        <MapComponent />
      </div>
    </main>
  );
}
