
export type Mode = "simple" | "steps" | "bullets";

export function detectHintMode(text: string): boolean {
  const t = text.toLowerCase();
  
  const triggers = [
    // Math
    "solve", "calculate", "find the value", "prove", "derive", 
    "equation", "algebra", "geometry", "calculus", "evaluate", 
    "simplify", "integral", "derivative", "theorem", "proof",
    
    // Programming
    "write a program", "write code", "implement", "debug", 
    "algorithm", "stack trace", "compiler", "script", "code snippet",
    "implement in python", "implement in java", "write pseudocode", "show steps",
    
    // Writing/Essays
    "write an essay", "write a summary", "thesis statement", 
    "write a paragraph", "conclusion", "outline", "draft",
    
    // General Coursework
    "assignment", "homework", "quiz", "exam", 
    "worksheet", "lab report", "midterm", "final", 
    "problem set", "exam question", "homework question"
  ];

  return triggers.some((k) => t.includes(k));
}

export function buildGuardrailInstructions(mode: Mode, hintMode: boolean): string {
  const baseRules = `
You are LearnEase, a learning support assistant.
Goal: help understanding by rewriting/structuring the user's provided content.
Do NOT provide final answers to homework-style questions. Do NOT solve equations directly. Do NOT output completed solutions or full essays.
`;

  const hintInstructions = hintMode ? `
IMPORTANT: Hint Mode is ACTIVE. The user input appears to be an assignment or problem-solving task.
- Do NOT simply provide the answer or solution.
- Explain the underlying concept or theory.
- Provide a general method, formula, or template for solving such problems.
- Give a small illustrative example that is DIFFERENT from the user's specific problem.
- Encourage the user to attempt the specific problem themselves.
` : `
Hint Mode is INACTIVE. However, maintain academic integrity.
- Focus on clarity, structure, and comprehension.
- If the content turns out to be a question, treat it cautiously as if in Hint Mode.
`;

  const formatInstructions =
    mode === "simple"
      ? "Output a short, simple explanation in 4–7 sentences."
      : mode === "steps"
        ? "Output a step-by-step breakdown as numbered steps (5–10 steps). No final answer."
        : "Output a bullet-point summary (6–10 bullets). No final answer.";

  return `${baseRules}\n${hintInstructions}\n${formatInstructions}`;
}
