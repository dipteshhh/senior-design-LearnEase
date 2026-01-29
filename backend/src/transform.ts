import { Request, Response } from "express";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function looksLikeAssignment(text: string): boolean {
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

export type Mode = "simple" | "steps" | "bullets";

function modeInstruction(mode: Mode, hintMode: boolean): string {
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

export async function transformHandler(req: Request, res: Response): Promise<void> {
  try {
    const { inputText, mode } = req.body as {
      inputText?: string;
      mode?: Mode;
    };

    if (!inputText || !mode) {
      res.status(400).json({ error: "Missing inputText or mode" });
      return;
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

    const outputText = (response as { output_text?: string }).output_text ?? "";

    res.json({
      hintMode,
      mode,
      outputText,
    });
  } catch (err: unknown) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Server error";
    res.status(500).json({ error: message });
  }
}
