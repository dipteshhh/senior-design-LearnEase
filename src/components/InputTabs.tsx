"use client";

import { useState } from "react";

const tabs = ["Paste Text", "Upload PDF", "Upload DOCX"];

export default function InputTabs() {
  const [activeTab, setActiveTab] = useState("Paste Text");

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm ${
              activeTab === tab
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "Paste Text" && (
        <textarea
          className="w-full h-64 border rounded p-2"
          placeholder="Paste text here..."
        />
      )}

      {activeTab === "Upload PDF" && (
        <input type="file" accept=".pdf" />
      )}

      {activeTab === "Upload DOCX" && (
        <input type="file" accept=".docx" />
      )}
    </div>
  );
}
