"use client";
import { MapComponent } from "../components/Map";
import SidebarComponent from "../components/Sidebar";
import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";

export default function Map() {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="h-screen w-screen flex items-center justify-between p">
        <MapComponent />
        <SidebarComponent />
      </div>
    </QueryClientProvider>
  );
}
