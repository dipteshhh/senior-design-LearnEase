import { NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Simple "assignment-ish" detection (keep improving later)
function looksLikeAssignment(text: string) {
  const t = text.toLowerCase();
  const triggers = [
    "solve",
    "calculate",
    "show your work",
    "find the value",
    "prove",
    "derive",
    "write a program",
    "write code",
    "implement",
    "answer",
    "homework",
    "assignment",
    "quiz",
    "exam",
    "worksheet",
  ];
  return triggers.some((k) => t.includes(k));
}

type Mode = "simple" | "steps" | "bullets";

function modeInstruction(mode: Mode, hintMode: boolean) {
  const baseRules = `
You are LearnEase, a learning support assistant.
Goal: help understanding by rewriting/structuring the user's provided content.
Do NOT provide final answers to homework-style questions. Do NOT solve equations. Do NOT output completed solutions.
If the user input appears to be an assignment prompt, switch to "Hint Mode":
- Explain the concept
- Provide a general method/template
- Give a small illustrative example that is NOT the same as the user's problem
- Encourage the user to attempt it themselves
Keep it concise and student-friendly.
`;

  const format =
    mode === "simple"
      ? "Output a short, simple explanation in 4–7 sentences."
      : mode === "steps"
      ? "Output a step-by-step breakdown as numbered steps (5–10 steps). No final answer."
      : "Output a bullet-point summary (6–10 bullets). No final answer.";

  const hintLine = hintMode
    ? "\nIMPORTANT: Hint Mode is ON. You must not produce a final answer.\n"
    : "\nHint Mode is OFF. Still do not produce completed homework answers.\n";

  return `${baseRules}\n${hintLine}\n${format}`;
}

export async function POST(req: Request) {
  try {
    const { inputText, mode } = (await req.json()) as {
      inputText?: string;
      mode?: Mode;
    };

    if (!inputText || !mode) {
      return NextResponse.json(
        { error: "Missing inputText or mode" },
        { status: 400 }
      );
    }

    const hintMode = looksLikeAssignment(inputText);

    const model = "gpt-4o-mini";

    const response = await client.responses.create({
      model,
      instructions: modeInstruction(mode, hintMode),
      input: inputText,
      max_output_tokens: 350,
      temperature: 0.3,
    });

    return NextResponse.json({
      hintMode,
      mode,
      outputText: response.output_text ?? "",
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
