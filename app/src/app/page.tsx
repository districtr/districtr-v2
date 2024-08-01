"use client";
import { MapComponent } from "./components/Map";
import SidebarComponent from "./components/sidebar/Sidebar";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect } from "react";

const queryClient = new QueryClient();

export default function Home() {
<<<<<<< HEAD
  return (
    <QueryClientProvider client={queryClient}>
      <main>
        <div className="h-screen w-screen flex justify-between p">
          <MapComponent />
          <SidebarComponent />
        </div>
      </main>
    </QueryClientProvider>
  );
=======
  // this is gated currently via async redirect in next.config.js
  return <div>hello world</div>;
>>>>>>> gate index / rearrange pages
}
