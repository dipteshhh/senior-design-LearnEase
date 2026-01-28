"use client";

import { useState } from "react";

type Props = {
  inputText: string;
  setInputText: (text: string) => void;
};

const tabs = ["Paste Text", "Upload PDF", "Upload DOCX"];

export default function InputTabs({ inputText, setInputText }: Props) {
  const [activeTab, setActiveTab] = useState("Paste Text");

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
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Paste Text */}
      {activeTab === "Paste Text" && (
        <textarea
          className="w-full h-64 border rounded p-2"
          placeholder="Paste text here..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
      )}

      {/* Upload PDF */}
      {activeTab === "Upload PDF" && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-600">Upload a PDF document</label>
          <input type="file" accept=".pdf" />
          <p className="text-xs text-gray-500">PDF extraction coming next.</p>
        </div>
      )}

      {/* Upload DOCX */}
      {activeTab === "Upload DOCX" && (
        <div className="flex flex-col gap-2">
          <label className="text-sm text-gray-600">
            Upload a Word document (.docx)
          </label>
          <input type="file" accept=".docx" />
          <p className="text-xs text-gray-500">DOCX extraction coming next.</p>
        </div>
      )}
    </div>
  );
}
