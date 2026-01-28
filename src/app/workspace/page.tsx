"use client";

import { useState } from "react";
import InputTabs from "@/components/InputTabs";
import OutputTabs from "@/components/OutputTabs";
import GuardrailsNotice from "@/components/GuardRailsNotice";

export default function Workspace() {
  const [inputText, setInputText] = useState("");

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      {/* Title */}
      <h2 className="text-2xl font-semibold mb-4">
        Learning Workspace
      </h2>

      {/* Academic Integrity Guardrails */}
      <GuardrailsNotice />

      {/* Main Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Input</h3>
          <InputTabs
            inputText={inputText}
            setInputText={setInputText}
          />
        </div>

        {/* Output Panel */}
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Output</h3>
          <OutputTabs />
        </div>
      </div>
    </div>
  );
}
