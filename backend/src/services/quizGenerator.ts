import OpenAI from "openai";
import { Quiz as QuizSchema } from "../schemas/analyze.js";
import type { DocumentType, Quiz } from "../schemas/analyze.js";
import {
  ContractValidationError,
  validateQuizAgainstDocument,
} from "./outputValidator.js";
import type { FileType } from "../store/memoryStore.js";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface QuizGenerationMetadata {
  fileType: FileType;
  pageCount: number;
  paragraphCount: number | null;
}

const QUIZ_PROMPT_BASE = `You are LearnEase, an educational assistant that creates comprehension-only quiz questions from lecture documents.

RULES:
- Lecture-only and user-triggered.
- Return ONLY a valid JSON object.
- Every answer must be directly supported by supporting_quote and citations.
- supporting_quote and citation.excerpt must be verbatim text from the lecture.
- No reasoning/synthesis questions.
- No "why", "infer", or multi-step questions.
- No grading, analytics, or scoring.
- Do not fabricate citations or page/paragraph references.
- Return JSON only. No markdown or extra text.`;

function buildQuizPrompt(metadata: QuizGenerationMetadata): string {
  if (metadata.fileType === "PDF") {
    return `${QUIZ_PROMPT_BASE}

Return JSON in this shape:
{
  "document_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "supporting_quote": "verbatim text from the lecture",
      "citations": [
        { "source_type": "pdf", "page": 1, "excerpt": "verbatim excerpt" }
      ]
    }
  ]
}`;
  }

  return `${QUIZ_PROMPT_BASE}

Return JSON in this shape:
{
  "document_id": "uuid",
  "questions": [
    {
      "id": "uuid",
      "question": "string",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "supporting_quote": "verbatim text from the lecture",
      "citations": [
        { "source_type": "docx", "anchor_type": "paragraph", "paragraph": 1, "excerpt": "verbatim excerpt" }
      ]
    }
  ]
}`;
}

function buildCitationRequirements(metadata: QuizGenerationMetadata): string {
  if (metadata.fileType === "PDF") {
    const maxPage = Math.max(1, metadata.pageCount);
    return `Citation requirements for this document:
- Document file type is PDF.
- Use only PDF citations: { "source_type": "pdf", "page": number, "excerpt": string }.
- "page" MUST be an integer between 1 and ${maxPage}.
- NEVER use DOCX citation fields (anchor_type, paragraph).`;
  }

  const maxParagraph = Math.max(1, metadata.paragraphCount ?? 1);
  return `Citation requirements for this document:
- Document file type is DOCX.
- Use only DOCX citations: { "source_type": "docx", "anchor_type": "paragraph", "paragraph": number, "excerpt": string }.
- "paragraph" MUST be an integer between 1 and ${maxParagraph}.
- NEVER use PDF citation fields (page).`;
}

function buildRepairHint(error: unknown): string {
  if (!(error instanceof ContractValidationError)) {
    return "";
  }

  const details = error.details ? JSON.stringify(error.details) : "{}";
  return `The previous output was rejected.
Error code: ${error.code}
Error message: ${error.message}
Validation details: ${details}

Regenerate the entire JSON and fix these issues exactly.`;
}

export async function generateQuiz(
  documentId: string,
  text: string,
  documentType: DocumentType,
  metadata: QuizGenerationMetadata
): Promise<Quiz> {
  if (documentType !== "LECTURE") {
    throw new ContractValidationError(
      "DOCUMENT_NOT_LECTURE",
      "Quiz generation is lecture-only.",
      { document_type: documentType }
    );
  }

  const citationRequirements = buildCitationRequirements(metadata);
  const quizPrompt = buildQuizPrompt(metadata);
  let lastError: unknown = null;
  let repairHint = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: [quizPrompt, citationRequirements, repairHint].filter(Boolean).join("\n\n"),
          },
          {
            role: "user",
            content:
              `Document ID: ${documentId}\n` +
              `Document file type: ${metadata.fileType}\n\n` +
              `Lecture text:\n${text}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 1500,
        temperature: 0.2,
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

      const validated = QuizSchema.safeParse(parsed);
      if (!validated.success) {
        throw new ContractValidationError(
          "SCHEMA_VALIDATION_FAILED",
          "Model output did not match Quiz schema.",
          { issues: validated.error.issues }
        );
      }

      const result: Quiz = {
        ...validated.data,
        document_id: documentId,
      };

      validateQuizAgainstDocument(
        result,
        {
          text,
          fileType: metadata.fileType,
          pageCount: metadata.pageCount,
          paragraphCount: metadata.paragraphCount,
        },
        documentType
      );

      return result;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        repairHint = buildRepairHint(error);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ContractValidationError(
        "SCHEMA_VALIDATION_FAILED",
        "Quiz output failed validation after retries."
      );
}
