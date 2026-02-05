import OpenAI from "openai";
import type {
  DocumentType,
  TaskItem,
  Requirements,
  AnalyzeDocumentResponse,
} from "../schemas/analyze.js";
import { detectDocumentType } from "./documentDetector.js";
import { shouldEnableGuidanceMode, getRestrictions } from "./guardrails.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ANALYSIS_PROMPT = `You are LearnEase, an educational assistant that helps students organize and understand their learning materials.

Your role is to STRUCTURE and ORGANIZE content - NOT to complete assignments or provide answers.

Given the document text, extract and return a JSON object with:

1. "overview": A 2-3 sentence summary of what this document is about (NOT answers, just what it covers)

2. "taskBreakdown": An array of tasks the student needs to do, each with:
   - "task": Description of what to do
   - "priority": "high", "medium", or "low"
   - "estimatedTime": Optional time estimate (e.g., "30 minutes", "2 hours")

3. "requirements": Object containing any mentioned requirements:
   - "wordCount": Word/page count if mentioned
   - "format": Required format (APA, MLA, etc.)
   - "deadline": Due date if mentioned
   - "submissionMethod": How to submit if mentioned
   - "otherRequirements": Array of other requirements

4. "checklist": Array of actionable checklist items (things to verify before submission)

5. "keyDates": Array of important dates found, each with:
   - "date": The date string as found
   - "description": What the date is for

IMPORTANT RULES:
- Do NOT solve problems or provide answers
- Do NOT write essay content or code
- Do NOT complete any part of the assignment
- ONLY organize and structure what needs to be done
- Focus on helping the student understand WHAT to do, not HOW to answer

Return ONLY valid JSON, no markdown or explanation.`;

const GUIDANCE_MODE_ADDITION = `

GUIDANCE MODE IS ACTIVE - This appears to be an assignment.
- Be extra careful not to provide any answers
- Focus purely on organization and structure
- Help the student understand the requirements, not the solutions
- If there are questions to answer, list them as tasks but do NOT answer them`;

interface AnalysisResult {
  overview: string;
  taskBreakdown: TaskItem[];
  requirements: Requirements;
  checklist: string[];
  keyDates: { date: string; description: string }[];
}

export async function analyzeDocument(
  text: string,
  providedDocumentType?: DocumentType
): Promise<AnalyzeDocumentResponse> {
  const detection = detectDocumentType(text);
  const documentType = providedDocumentType ?? detection.documentType;
  const guidanceMode = shouldEnableGuidanceMode(
    documentType,
    detection.isAssignment,
    detection.confidence
  );
  const restrictions = getRestrictions(documentType, guidanceMode);

  const prompt = guidanceMode
    ? ANALYSIS_PROMPT + GUIDANCE_MODE_ADDITION
    : ANALYSIS_PROMPT;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: prompt,
      },
      {
        role: "user",
        content: `Analyze this document and return structured JSON:\n\n${text}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  
  let parsed: AnalysisResult;
  try {
    parsed = JSON.parse(content) as AnalysisResult;
  } catch {
    parsed = {
      overview: "Unable to analyze document. Please try again.",
      taskBreakdown: [],
      requirements: {},
      checklist: [],
      keyDates: [],
    };
  }

  return {
    documentType,
    overview: parsed.overview ?? "",
    taskBreakdown: (parsed.taskBreakdown ?? []).map((t) => ({
      task: t.task ?? "",
      priority: t.priority ?? "medium",
      estimatedTime: t.estimatedTime,
    })),
    requirements: {
      wordCount: parsed.requirements?.wordCount,
      format: parsed.requirements?.format,
      deadline: parsed.requirements?.deadline,
      submissionMethod: parsed.requirements?.submissionMethod,
      otherRequirements: parsed.requirements?.otherRequirements,
    },
    checklist: parsed.checklist ?? [],
    keyDates: (parsed.keyDates ?? []).map((d) => ({
      date: d.date ?? "",
      description: d.description ?? "",
    })),
    academicIntegrity: {
      isAssignment: detection.isAssignment,
      guidanceMode,
      restrictions,
    },
  };
}
