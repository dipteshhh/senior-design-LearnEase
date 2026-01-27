"use client";

import { useState } from "react";

const tabs = ["Simple", "Steps", "Bullets"];

export default function OutputTabs() {
  const [activeTab, setActiveTab] = useState("Simple");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
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
      </div>

      {/* Tab Content */}
      {activeTab === "Simple" && (
        <p className="text-gray-700">
          A simplified explanation will appear here.
        </p>
      )}

      {activeTab === "Steps" && (
        <p className="text-gray-700">
          Step-by-step breakdown will appear here.
        </p>
      )}

      {activeTab === "Bullets" && (
        <p className="text-gray-700">
          Bullet-point summary will appear here.
        </p>
      )}
    </div>
  );
}
