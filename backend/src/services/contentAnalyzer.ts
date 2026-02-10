import OpenAI from "openai";
import type {
  DocumentType,
  StudyGuide,
} from "../schemas/analyze.js";
import { StudyGuide as StudyGuideSchema } from "../schemas/analyze.js";
import { detectDocumentType } from "./documentDetector.js";
import { shouldEnableGuidanceMode, getRestrictions } from "./guardrails.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ANALYSIS_PROMPT = `You are LearnEase, an educational assistant that helps students organize and understand their learning materials.

Your role is to EXTRACT and RESTRUCTURE content from a document - NOT to complete assignments or provide answers.

Return ONLY a JSON object with exactly these keys:
- overview
- key_actions
- checklist
- important_details
- sections

Schema requirements:
- overview: { title, document_type, summary }
- key_actions: ExtractionItem[]
- checklist: ExtractionItem[]
- important_details: { dates: ExtractionItem[], policies: ExtractionItem[], contacts: ExtractionItem[], logistics: ExtractionItem[] }
- sections: [{ id, title, content, citations }]

ExtractionItem schema:
- id: string
- label: string
- supporting_quote: verbatim quote from the input text
- citations: at least one citation

Citations:
- For pdf: { source_type: "pdf", page: number, excerpt: string }
- For docx: { source_type: "docx", anchor_type: "paragraph", paragraph: number, excerpt: string }

IMPORTANT RULES:
- Do NOT solve problems or provide answers
- Do NOT write essay content or code
- Do NOT complete any part of the assignment
- Every extracted item MUST include supporting_quote and citations
- Quotes and excerpts must come from the provided text

Return ONLY valid JSON, no markdown or explanation.`;

const GUIDANCE_MODE_ADDITION = `

GUIDANCE MODE IS ACTIVE - This appears to be an assignment.
- Be extra careful not to provide any answers
- Focus purely on organization and structure
- Help the student understand the requirements, not the solutions
- If there are questions to answer, list them as tasks but do NOT answer them`;

function makeFallbackStudyGuide(documentType: "HOMEWORK" | "LECTURE" | "SYLLABUS"): StudyGuide {
  return {
    overview: {
      title: "Study Guide",
      document_type: documentType,
      summary: "Unable to generate a study guide from the provided document.",
    },
    key_actions: [],
    checklist: [],
    important_details: {
      dates: [],
      policies: [],
      contacts: [],
      logistics: [],
    },
    sections: [],
  };
}

export async function analyzeDocument(
  text: string,
  providedDocumentType?: DocumentType
): Promise<StudyGuide> {
  const detection = detectDocumentType(text);
  const documentType = providedDocumentType ?? detection.documentType;
  if (documentType === "UNSUPPORTED") {
    throw new Error("DOCUMENT_UNSUPPORTED");
  }

  const supportedType = documentType as "HOMEWORK" | "LECTURE" | "SYLLABUS";
  const guidanceMode = shouldEnableGuidanceMode(
    documentType,
    detection.isAssignment
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
        content: `Document type: ${supportedType}\n\nDocument text:\n${text}`,
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 1500,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return makeFallbackStudyGuide(supportedType);
  }

  const validated = StudyGuideSchema.safeParse(parsed);
  if (!validated.success) {
    return makeFallbackStudyGuide(supportedType);
  }

  return validated.data;
}
