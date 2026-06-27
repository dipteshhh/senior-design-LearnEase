import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createHash, randomUUID } from "crypto";
import {
  VisualObservationModelResponse,
  type VisualObservation,
  type VisualObservationModelResponse as VisualObservationModelResponseType,
  type VisualObservationsArtifact,
} from "../schemas/visualObservations.js";
import { readEnvInt } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import {
  getDocumentMetadata,
  getVisualInventoryArtifactHash,
  getVisualInventoryManifest,
  readVisualInventoryAssetBytes,
  saveVisualObservationsArtifact,
} from "../store/memoryStore.js";
import type { VisualInventoryItem } from "./visualInventory.js";
import {
  computeAttemptTimeoutMs,
  getGenerationPolicy,
  selectModelForAttempt,
  withOpenAiConcurrency,
} from "./generationReliability.js";

const DEFAULT_OPENAI_TIMEOUT_MS = 60000;
const DEFAULT_OPENAI_MAX_RETRIES = 0;
const DEFAULT_VISUAL_OBSERVATION_MAX_IMAGES = 3;
const DEFAULT_VISUAL_OBSERVATION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const DEFAULT_VISUAL_OBSERVATION_MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const VISUAL_OBSERVATION_RESPONSE_FORMAT = zodResponseFormat(
  VisualObservationModelResponse,
  "visual_observations"
);

const VISUAL_OBSERVATION_PROMPT = `You are describing visual content for study support.
Do not solve homework problems.
Do not provide answer choices, final answers, solution steps, or hints.
For lecture/class notes, summarize what is visibly present.
Extract visible text only if clearly readable.
If uncertain, say so in limitations.
Do not infer beyond what is visible.
Return only structured JSON.`;

interface SelectedVisualInventoryItem {
  item: VisualInventoryItem;
  content: Buffer;
}

export interface VisualObservationAnalyzerOptions {
  maxImages?: number;
  maxImageBytes?: number;
  maxTotalBytes?: number;
}

function getOpenAiTimeoutMs(): number {
  return readEnvInt("OPENAI_TIMEOUT_MS", DEFAULT_OPENAI_TIMEOUT_MS, 1000);
}

function getOpenAiMaxRetries(): number {
  return readEnvInt("OPENAI_MAX_RETRIES", DEFAULT_OPENAI_MAX_RETRIES, 0);
}

function getVisualObservationMaxImages(): number {
  return readEnvInt(
    "VISUAL_OBSERVATIONS_MAX_IMAGES",
    DEFAULT_VISUAL_OBSERVATION_MAX_IMAGES,
    1
  );
}

function getVisualObservationMaxImageBytes(): number {
  return readEnvInt(
    "VISUAL_OBSERVATIONS_MAX_IMAGE_BYTES",
    DEFAULT_VISUAL_OBSERVATION_MAX_IMAGE_BYTES,
    1
  );
}

function getVisualObservationMaxTotalBytes(): number {
  return readEnvInt(
    "VISUAL_OBSERVATIONS_MAX_TOTAL_BYTES",
    DEFAULT_VISUAL_OBSERVATION_MAX_TOTAL_BYTES,
    1
  );
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: getOpenAiTimeoutMs(),
  maxRetries: getOpenAiMaxRetries(),
});

function makeArtifact(params: {
  documentId: string;
  status: VisualObservationsArtifact["status"];
  model: string;
  sourceInventoryArtifactHash?: string;
  observations?: VisualObservation[];
  warnings?: string[];
}): VisualObservationsArtifact {
  return {
    document_id: params.documentId,
    status: params.status,
    created_at: new Date().toISOString(),
    model: params.model,
    source_inventory_artifact_hash: params.sourceInventoryArtifactHash,
    observations: params.observations ?? [],
    warnings: params.warnings ?? [],
  };
}

function selectInventoryItems(
  documentId: string,
  items: VisualInventoryItem[],
  options: Required<VisualObservationAnalyzerOptions>
): { selected: SelectedVisualInventoryItem[]; warnings: string[] } {
  const selected: SelectedVisualInventoryItem[] = [];
  const warnings: string[] = [];
  let totalBytes = 0;

  for (const item of items) {
    if (selected.length >= options.maxImages) {
      warnings.push(
        `Visual observations reached max images (${options.maxImages}); skipped remaining visuals.`
      );
      break;
    }

    if (item.byte_size > options.maxImageBytes) {
      warnings.push(
        `Skipped image ${item.image_index}: byte size exceeds max image bytes.`
      );
      continue;
    }

    if (totalBytes + item.byte_size > options.maxTotalBytes) {
      warnings.push(
        `Visual observations reached max total bytes (${options.maxTotalBytes}); skipped remaining visuals.`
      );
      break;
    }

    let content: Buffer;
    try {
      content = readVisualInventoryAssetBytes(documentId, item.encrypted_artifact_path);
    } catch {
      warnings.push(`Skipped image ${item.image_index}: visual asset could not be read.`);
      continue;
    }

    if (content.byteLength > options.maxImageBytes) {
      warnings.push(
        `Skipped image ${item.image_index}: decrypted byte size exceeds max image bytes.`
      );
      continue;
    }

    if (content.byteLength !== item.byte_size) {
      warnings.push(`Skipped image ${item.image_index}: byte size did not match inventory.`);
      continue;
    }

    const actualHash = createHash("sha256").update(content).digest("hex");
    if (actualHash !== item.image_hash) {
      warnings.push(`Skipped image ${item.image_index}: SHA-256 did not match inventory.`);
      continue;
    }

    if (totalBytes + content.byteLength > options.maxTotalBytes) {
      warnings.push(
        `Visual observations reached max total bytes (${options.maxTotalBytes}); skipped remaining visuals.`
      );
      break;
    }

    selected.push({ item, content });
    totalBytes += content.byteLength;
  }

  return { selected, warnings };
}

function buildVisionUserContent(selected: SelectedVisualInventoryItem[]) {
  const content: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        "Describe each image using its provided image_index. " +
        "Only use what is visible in the images. Return observations for images that are interpretable.",
    },
  ];

  for (const { item, content: imageBytes } of selected) {
    content.push({
      type: "text",
      text:
        `image_index: ${item.image_index}\n` +
        `source_file_type: ${item.source_file_type}\n` +
        `origin: ${item.origin}\n` +
        `content_type: ${item.content_type}\n` +
        `media_path: ${item.media_path ?? "not available"}\n` +
        `page: ${item.page ?? "not available"}`,
    });
    content.push({
      type: "image_url",
      image_url: {
        url: `data:${item.content_type};base64,${imageBytes.toString("base64")}`,
      },
    });
  }

  return content;
}

function bindModelObservationsToInventory(
  selected: SelectedVisualInventoryItem[],
  parsed: VisualObservationModelResponseType
): { observations: VisualObservation[]; warnings: string[] } {
  const byImageIndex = new Map(selected.map(({ item }) => [item.image_index, item]));
  const seen = new Set<number>();
  const observations: VisualObservation[] = [];
  const warnings: string[] = [];

  for (const observation of parsed.observations) {
    const item = byImageIndex.get(observation.image_index);
    if (!item) {
      warnings.push(`Ignored model observation for unknown image ${observation.image_index}.`);
      continue;
    }
    if (seen.has(observation.image_index)) {
      warnings.push(`Ignored duplicate model observation for image ${observation.image_index}.`);
      continue;
    }
    seen.add(observation.image_index);

    observations.push({
      id: randomUUID(),
      visual_inventory_item_id: item.id,
      image_hash: item.image_hash,
      source_file_type: item.source_file_type,
      origin: item.origin,
      media_path: item.media_path,
      page: item.page ?? null,
      image_index: item.image_index,
      content_type: item.content_type,
      type: observation.type,
      summary: observation.summary,
      visible_text: observation.visible_text,
      academic_relevance: observation.academic_relevance,
      confidence: observation.confidence,
      limitations: observation.limitations,
    });
  }

  for (const { item } of selected) {
    if (!seen.has(item.image_index)) {
      warnings.push(`No model observation returned for image ${item.image_index}.`);
    }
  }

  if (observations.length === 0 && selected.length > 0) {
    warnings.push("No visual observations were generated for selected images.");
  }

  return { observations, warnings };
}

export async function generateVisualObservationsForDocument(
  documentId: string,
  userId: string,
  openAiClient: OpenAI = client,
  options: VisualObservationAnalyzerOptions = {}
): Promise<VisualObservationsArtifact> {
  const document = getDocumentMetadata(documentId);
  const policy = getGenerationPolicy();
  const model = policy.primaryModel;
  const sourceInventoryArtifactHash = getVisualInventoryArtifactHash(documentId);

  if (!document || document.userId !== userId) {
    throw new Error("Document not found for visual observations.");
  }

  if (document.documentType !== "LECTURE") {
    const artifact = makeArtifact({
      documentId,
      status: "skipped",
      model,
      sourceInventoryArtifactHash,
      warnings: ["Visual observations are only available for lecture documents."],
    });
    saveVisualObservationsArtifact(documentId, artifact);
    return artifact;
  }

  const inventoryRead = getVisualInventoryManifest(documentId);
  if (!inventoryRead.ok) {
    const artifact = makeArtifact({
      documentId,
      status: "skipped",
      model,
      sourceInventoryArtifactHash,
      warnings: ["No visual inventory artifact is available for this document."],
    });
    saveVisualObservationsArtifact(documentId, artifact);
    return artifact;
  }

  const inventory = inventoryRead.manifest;
  if (inventory.items.length === 0) {
    const artifact = makeArtifact({
      documentId,
      status: "skipped",
      model,
      sourceInventoryArtifactHash,
      warnings: [
        "Visual inventory does not contain images eligible for visual observations.",
        ...inventory.warnings,
      ],
    });
    saveVisualObservationsArtifact(documentId, artifact);
    return artifact;
  }

  const caps: Required<VisualObservationAnalyzerOptions> = {
    maxImages: options.maxImages ?? getVisualObservationMaxImages(),
    maxImageBytes: options.maxImageBytes ?? getVisualObservationMaxImageBytes(),
    maxTotalBytes: options.maxTotalBytes ?? getVisualObservationMaxTotalBytes(),
  };
  const { selected, warnings: selectionWarnings } = selectInventoryItems(
    documentId,
    inventory.items,
    caps
  );

  if (selected.length === 0) {
    const artifact = makeArtifact({
      documentId,
      status: "skipped",
      model,
      sourceInventoryArtifactHash,
      warnings: [
        "No visual inventory images were selected within visual observation caps.",
        ...selectionWarnings,
      ],
    });
    saveVisualObservationsArtifact(documentId, artifact);
    return artifact;
  }

  const requestTimeoutMs = computeAttemptTimeoutMs(getOpenAiTimeoutMs(), 1);
  const response = await withOpenAiConcurrency(() =>
    openAiClient.chat.completions.create(
      {
        model: selectModelForAttempt(policy, 1, null),
        messages: [
          { role: "system", content: VISUAL_OBSERVATION_PROMPT },
          { role: "user", content: buildVisionUserContent(selected) as never },
        ],
        response_format: VISUAL_OBSERVATION_RESPONSE_FORMAT,
        max_tokens: 2500,
        temperature: 0,
      },
      { timeout: requestTimeoutMs }
    )
  );

  const content = response.choices[0]?.message?.content ?? "{}";
  const parsed = VisualObservationModelResponse.parse(JSON.parse(content) as unknown);
  const bound = bindModelObservationsToInventory(selected, parsed);
  const allWarnings = [...inventory.warnings, ...selectionWarnings, ...bound.warnings];
  const artifact = makeArtifact({
    documentId,
    status: allWarnings.length > 0 ? "partial" : "complete",
    model: selectModelForAttempt(policy, 1, null),
    sourceInventoryArtifactHash,
    observations: bound.observations,
    warnings: allWarnings,
  });

  saveVisualObservationsArtifact(documentId, artifact);
  return artifact;
}

export async function generateVisualObservationsBestEffort(
  documentId: string,
  userId: string,
  openAiClient: OpenAI = client
): Promise<void> {
  try {
    await generateVisualObservationsForDocument(documentId, userId, openAiClient);
  } catch (error) {
    logger.warn("Visual observation generation skipped", {
      documentId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
