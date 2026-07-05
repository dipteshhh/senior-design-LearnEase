import type { VisualObservation, VisualObservationsArtifact } from "@/lib/contracts";

/**
 * Visual Notes Beta display helpers.
 *
 * Visual observations are AI descriptions of embedded visuals. They are not
 * exact-text citations and must never be presented as source-grounded quotes.
 */

export function getVisualObservationItems(
  artifact: VisualObservationsArtifact | null | undefined
): VisualObservation[] {
  return artifact?.observations ?? [];
}

/** The Visual Notes tab renders only when at least one observation exists. */
export function shouldShowVisualNotesTab(
  artifact: VisualObservationsArtifact | null | undefined
): boolean {
  return getVisualObservationItems(artifact).length > 0;
}

export function formatVisualObservationType(type: VisualObservation["type"]): string {
  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatVisualConfidence(
  confidence: VisualObservation["confidence"]
): string {
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

export function formatVisualSource(observation: VisualObservation): string {
  const parts = [`Image ${observation.image_index}`];
  if (observation.media_path) {
    parts.push(observation.media_path);
  }
  if (observation.page != null) {
    parts.push(`Page ${observation.page}`);
  }
  return parts.join(" · ");
}
