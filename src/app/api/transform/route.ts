import { NextResponse } from "next/server";

type TransformMode = "simple" | "steps" | "bullets";

function looksLikeAssignment(text: string) {
  const t = text.toLowerCase();
  const keywords = [
    "solve",
    "calculate",
    "prove",
    "derive",
    "find the answer",
    "write an essay",
    "complete the homework",
    "answer the following",
    "show your work",
    "due",
    "submit",
  ];
  return keywords.some((k) => t.includes(k));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputText = String(body?.inputText ?? "").trim();
    const mode = String(body?.mode ?? "simple") as TransformMode;

    if (!inputText) {
      return NextResponse.json(
        { error: "inputText is required" },
        { status: 400 }
      );
    }

    const hintMode = looksLikeAssignment(inputText);

    // Placeholder backend output (NO AI yet)
    let outputText = "";

    if (mode === "simple") {
      outputText = hintMode
        ? "Hint Mode: This appears to be an assignment. Here is a conceptual explanation to help you learn."
        : "This is a simple explanation placeholder.";
    }

    if (mode === "steps") {
      outputText =
        "Step-by-step placeholder:\n1) Identify the concept\n2) Break it down\n3) Explain each part";
    }

    if (mode === "bullets") {
      outputText =
        "• Key idea\n• Supporting detail\n• Important takeaway";
    }

    return NextResponse.json({
      hintMode,
      mode,
      outputText,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
