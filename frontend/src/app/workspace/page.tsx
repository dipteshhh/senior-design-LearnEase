"use client";

import { useState } from "react";
import InputTabs from "@/components/InputTabs";
import OutputTabs from "@/components/OutputTabs";
import GuardrailsNotice from "@/components/GuardRailsNotice";

type Mode = "simple" | "steps" | "bullets";

export default function Workspace() {
  const [inputText, setInputText] = useState("");

  const [simpleText, setSimpleText] = useState("");
  const [stepsText, setStepsText] = useState("");
  const [bulletsText, setBulletsText] = useState("");

  const [hintMode, setHintMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function runTransform(mode: Mode) {
    setIsLoading(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
      const res = await fetch(`${apiBase}/api/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputText, mode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Request failed");
      }

      setHintMode(Boolean(data.hintMode));

      const out = String(data.outputText ?? "");

      if (mode === "simple") setSimpleText(out);
      if (mode === "steps") setStepsText(out);
      if (mode === "bullets") setBulletsText(out);
    } catch (e: any) {
      alert(e?.message || "Error calling backend");
    } finally {
      setIsLoading(false);
    }
  }

  async function transformAll() {
    if (!inputText.trim()) {
      alert("Please paste text first.");
      return;
    }
    await runTransform("simple");
    await runTransform("steps");
    await runTransform("bullets");
  }

  return (
    <div className="min-h-screen p-8 bg-gray-100">
      <h2 className="text-2xl font-semibold mb-4">Learning Workspace</h2>

      <GuardrailsNotice />

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded shadow">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Input</h3>

            <button
              onClick={transformAll}
              disabled={isLoading}
              className={`px-4 py-2 text-sm rounded ${
                isLoading
                  ? "bg-gray-300 text-gray-600"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {isLoading ? "Working..." : "Transform"}
            </button>
          </div>

          <InputTabs inputText={inputText} setInputText={setInputText} />
        </div>

        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Output</h3>
          <OutputTabs
            simpleText={simpleText}
            stepsText={stepsText}
            bulletsText={bulletsText}
            isLoading={isLoading}
            hintMode={hintMode}
          />
        </div>
      </div>
    </div>
  );
}
