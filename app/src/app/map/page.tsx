"use client";
import React from "react";
import { MapContextMenu } from "../components/ContextMenu";
import { MapComponent } from "../components/Map";
import SidebarComponent from "../components/sidebar/Sidebar";
import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";

export default function Map() {
  const queryClient = new QueryClient();

  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen flex justify-between p">
          <MapComponent />
          <SidebarComponent />
          <MapContextMenu />
        </div>
      </QueryClientProvider>
    );
  }
}
