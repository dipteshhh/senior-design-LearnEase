"use client";
import OutputTabs from "@/components/OutputTabs";
import { useState } from "react";
import InputTabs from "@/components/InputTabs";
export default function Workspace() {
  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h2 className="text-2xl font-semibold mb-6">Learning Workspace</h2>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Input</h3>
          <InputTabs />
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Output</h3>
           <OutputTabs />
        </div>
      </div>
    </div>
  );
}
