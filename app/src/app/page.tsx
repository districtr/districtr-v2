"use client";
import { MapComponent } from "./components/Map";
import SidebarComponent from "./components/sidebar/Sidebar";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <div className="h-screen w-screen flex items-center justify-between p">
          <MapComponent />
          <SidebarComponent />
        </div>
      </main>
    </QueryClientProvider>
  );
}
