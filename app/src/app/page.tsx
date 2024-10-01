"use client";
import { MapComponent } from "./components/Map";
import SidebarComponent from "./components/sidebar/Sidebar";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function Home() {
  return (
    <QueryClientProvider client={queryClient}>
      <main style={{background:"red"}} id="test">
        <div className="h-screen w-screen flex justify-between p"
         style={{
          flexDirection:"column",
          background: "red"
         }}>
          <MapComponent />
          <SidebarComponent />
        </div>
      </main>
    </QueryClientProvider>
  );

  // this is gated currently via async redirect in next.config.js
  return <div>hello world</div>;
}
