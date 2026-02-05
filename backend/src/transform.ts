import { Request, Response } from "express";
import OpenAI from "openai";
import { detectHintMode, buildGuardrailInstructions, Mode } from "./guardrails.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

    const hintMode = detectHintMode(inputText);
    const model = "gpt-4o-mini";

    const response = await client.responses.create({
      model,
      instructions: buildGuardrailInstructions(mode, hintMode),
      input: inputText,
      max_output_tokens: 350,
      temperature: 0.3,
    } as any); // Casting to any because strict types might complain about non-existent 'responses' property if using standard SDK

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
