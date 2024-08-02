"use client";
import { MapComponent } from "./components/Map";
import SidebarComponent from "./components/Sidebar";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { useRouter } from "next/router";
import { useEffect } from "react";

const queryClient = new QueryClient();

export default function Home() {
  // this is gated currently via async redirect in next.config.js
  return <div>hello world</div>;
}
