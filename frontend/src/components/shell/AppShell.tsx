"use client";

import { ReactNode } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <div className="flex">
        <Sidebar />

        <div className="flex-1">
          <Topbar />
          <main className="px-10 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
