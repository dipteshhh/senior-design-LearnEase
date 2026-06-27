import { z } from "zod";

export const VisualObservationType = z.enum([
  "diagram",
  "chart",
  "screenshot",
  "table_image",
  "photo",
  "other",
]);

export const VisualObservationConfidence = z.enum(["low", "medium", "high"]);

export const VisualObservation = z.object({
  id: z.string().min(1),
  visual_inventory_item_id: z.string().min(1),
  image_hash: z.string().min(1),
  source_file_type: z.enum(["DOCX", "PDF"]),
  origin: z.enum(["docx_embedded_image", "pdf_embedded_image"]),
  media_path: z.string().optional(),
  page: z.number().int().positive().nullable().optional(),
  image_index: z.number().int().positive(),
  content_type: z.string().min(1),
  type: VisualObservationType,
  summary: z.string().min(1),
  visible_text: z.array(z.string()),
  academic_relevance: z.string().min(1),
  confidence: VisualObservationConfidence,
  limitations: z.array(z.string()),
});
export type VisualObservation = z.infer<typeof VisualObservation>;

export const VisualObservationsArtifact = z.object({
  document_id: z.string().min(1),
  status: z.enum(["complete", "partial", "skipped"]),
  created_at: z.string().min(1),
  model: z.string().min(1),
  source_inventory_artifact_hash: z.string().optional(),
  observations: z.array(VisualObservation),
  warnings: z.array(z.string()),
});
export type VisualObservationsArtifact = z.infer<typeof VisualObservationsArtifact>;

export const VisualObservationModelItem = z.object({
  image_index: z.number().int().positive(),
  type: VisualObservationType,
  summary: z.string().min(1),
  visible_text: z.array(z.string()),
  academic_relevance: z.string().min(1),
  confidence: VisualObservationConfidence,
  limitations: z.array(z.string()),
});
export type VisualObservationModelItem = z.infer<typeof VisualObservationModelItem>;

export const VisualObservationModelResponse = z.object({
  observations: z.array(VisualObservationModelItem),
});
export type VisualObservationModelResponse = z.infer<typeof VisualObservationModelResponse>;
