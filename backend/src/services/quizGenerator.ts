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

const QUIZ_PROMPT = `You are LearnEase, an educational assistant that creates comprehension-only quiz questions from lecture documents.

Return ONLY a valid JSON object that matches this exact schema:
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
        { "source_type": "pdf", "page": 1, "excerpt": "..." }
      ]
    }
  ]
}

RULES:
- Lecture-only and user-triggered.
- Every answer must be directly supported by supporting_quote and citations.
- supporting_quote and citation.excerpt must be verbatim text from the lecture.
- No reasoning/synthesis questions.
- No "why", "infer", or multi-step questions.
- No grading, analytics, or scoring.
- Do not fabricate citations or page/paragraph references.
- Return JSON only. No markdown or extra text.`;

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

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: QUIZ_PROMPT,
      },
      {
        role: "user",
        content: `Document ID: ${documentId}\n\nLecture text:\n${text}`,
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
}

