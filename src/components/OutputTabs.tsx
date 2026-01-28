"use client";

import { useState } from "react";

type Props = {
  simpleText: string;
  stepsText: string;
  bulletsText: string;
  isLoading: boolean;
  hintMode: boolean;
};

const tabs = ["Simple", "Steps", "Bullets"] as const;
type Tab = (typeof tabs)[number];

export default function OutputTabs({
  simpleText,
  stepsText,
  bulletsText,
  isLoading,
  hintMode,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("Simple");

  const content =
    activeTab === "Simple"
      ? simpleText
      : activeTab === "Steps"
      ? stepsText
      : bulletsText;

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm transition ${
              activeTab === tab
                ? "bg-green-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}

        {hintMode && (
          <span className="ml-auto text-xs px-2 py-1 rounded bg-yellow-100 border border-yellow-300 text-yellow-800">
            Hint Mode Active
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <p className="text-gray-500">Generating…</p>
      ) : content ? (
        <pre className="whitespace-pre-wrap text-gray-800 text-sm">{content}</pre>
      ) : (
        <p className="text-gray-500">
          Output will appear here after you click Transform.
        </p>
      )}
    </div>
  );
}
