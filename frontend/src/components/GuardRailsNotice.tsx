"use client";

export default function GuardrailsNotice() {
  return (
    <div className="mb-4 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
      <strong>Academic Integrity Notice:</strong>
      <ul className="list-disc list-inside mt-1">
        <li>
          LearnEase does <strong>not</strong> generate final answers or completed
          homework.
        </li>
        <li>
          The system focuses on explanations, structure, and understanding.
        </li>
        <li>
          Assignment-style prompts may trigger <strong>Hint Mode</strong>.
        </li>
      </ul>
    </div>
  );
}
