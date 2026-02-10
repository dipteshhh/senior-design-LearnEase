import OpenAI from "openai";
import type {
  DocumentType,
  StudyGuide,
} from "../schemas/analyze.js";
import { StudyGuide as StudyGuideSchema } from "../schemas/analyze.js";
import { detectDocumentType } from "./documentDetector.js";
import { shouldEnableGuidanceMode, getRestrictions } from "./guardrails.js";
import {
  ContractValidationError,
  validateStudyGuideAgainstDocument,
} from "./outputValidator.js";
import type { FileType } from "../store/memoryStore.js";

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

interface AnalysisMetadata {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

export async function analyzeDocument(
  text: string,
  providedDocumentType: DocumentType | undefined,
  metadata: AnalysisMetadata
): Promise<StudyGuide> {
  const detection = detectDocumentType(text);
  const documentType = providedDocumentType ?? detection.documentType;
  if (documentType === "UNSUPPORTED") {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Unsupported document type cannot be analyzed.",
      { document_type: documentType }
    );
  }

  const supportedType = documentType as "HOMEWORK" | "LECTURE" | "SYLLABUS";
  const guidanceMode = shouldEnableGuidanceMode(
    documentType,
    detection.isAssignment
  );
  getRestrictions(documentType, guidanceMode);

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
  } catch (error) {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Model output was not valid JSON.",
      { reason: error instanceof Error ? error.message : "unknown" }
    );
  }

  const validated = StudyGuideSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ContractValidationError(
      "SCHEMA_VALIDATION_FAILED",
      "Model output did not match StudyGuide schema.",
      { issues: validated.error.issues }
    );
  }

  validateStudyGuideAgainstDocument(validated.data, {
    text,
    fileType: metadata.fileType,
    pageCount: metadata.pageCount,
    paragraphCount: metadata.paragraphCount,
  });

  return validated.data satisfies StudyGuide;
}
