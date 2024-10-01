"use client";
import React from "react";
import { MapContextMenu } from "../components/ContextMenu";
import { MapComponent } from "../components/Map";
import SidebarComponent from "../components/sidebar/Sidebar";
import MobileTopNav from "../components/sidebar/MobileTopNav";
import { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import { Portal } from "@radix-ui/themes";

export default function Map() {
  const queryClient = new QueryClient();

  if (queryClient) {
    return (
      <QueryClientProvider client={queryClient}>
        <div className="h-screen w-screen flex justify-between p flex-col-reverse md:flex-row-reverse">
          <SidebarComponent />
          <MapComponent />
          <MobileTopNav />
          <MapContextMenu />
        </div>
      </QueryClientProvider>
    );
  }
}
