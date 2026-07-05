import test from "node:test";
import assert from "node:assert/strict";
import type { VisualObservation, VisualObservationsArtifact } from "../lib/contracts.ts";
import {
  formatVisualConfidence,
  formatVisualObservationType,
  formatVisualSource,
  getVisualObservationItems,
  shouldShowVisualNotesTab,
} from "../lib/visualNotes.ts";

function makeObservation(overrides: Partial<VisualObservation> = {}): VisualObservation {
  return {
    id: "obs-1",
    visual_inventory_item_id: "docx-image-1",
    image_hash: "hash",
    source_file_type: "DOCX",
    origin: "docx_embedded_image",
    media_path: "word/media/image1.png",
    page: null,
    image_index: 1,
    content_type: "image/png",
    type: "diagram",
    summary: "A diagram is visible.",
    visible_text: [],
    academic_relevance: "Supports review.",
    confidence: "medium",
    limitations: [],
    ...overrides,
  };
}

function makeArtifact(
  observations: VisualObservation[],
  overrides: Partial<VisualObservationsArtifact> = {}
): VisualObservationsArtifact {
  return {
    document_id: "doc-1",
    status: "complete",
    created_at: new Date().toISOString(),
    model: "test-model",
    observations,
    warnings: [],
    ...overrides,
  };
}

test("shouldShowVisualNotesTab is false for null artifact", () => {
  assert.equal(shouldShowVisualNotesTab(null), false);
  assert.equal(shouldShowVisualNotesTab(undefined), false);
});

test("shouldShowVisualNotesTab is false for empty or skipped artifacts", () => {
  assert.equal(shouldShowVisualNotesTab(makeArtifact([])), false);
  assert.equal(
    shouldShowVisualNotesTab(makeArtifact([], { status: "skipped" })),
    false
  );
});

test("shouldShowVisualNotesTab is true when observations exist", () => {
  assert.equal(shouldShowVisualNotesTab(makeArtifact([makeObservation()])), true);
});

test("getVisualObservationItems returns empty array for null artifact", () => {
  assert.deepEqual(getVisualObservationItems(null), []);
  assert.deepEqual(getVisualObservationItems(undefined), []);
});

test("formatVisualObservationType converts snake_case to title case", () => {
  assert.equal(formatVisualObservationType("diagram"), "Diagram");
  assert.equal(formatVisualObservationType("table_image"), "Table Image");
  assert.equal(formatVisualObservationType("screenshot"), "Screenshot");
});

test("formatVisualConfidence capitalizes the level", () => {
  assert.equal(formatVisualConfidence("low"), "Low");
  assert.equal(formatVisualConfidence("medium"), "Medium");
  assert.equal(formatVisualConfidence("high"), "High");
});

test("formatVisualSource includes image index, media path, and page when present", () => {
  assert.equal(
    formatVisualSource(makeObservation()),
    "Image 1 · word/media/image1.png"
  );
  assert.equal(
    formatVisualSource(makeObservation({ media_path: undefined, page: 3, image_index: 2 })),
    "Image 2 · Page 3"
  );
  assert.equal(
    formatVisualSource(makeObservation({ media_path: undefined, page: null })),
    "Image 1"
  );
});
