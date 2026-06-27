import type { ExtractionItem, StudyGuide, StudyGuideSection } from "@/lib/contracts";

const MAX_SECTION_SENTENCES = 2;
const MAX_SECTION_WORDS = 60;

function normalizeSpeechText(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : null;
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function itemLabels(items: ExtractionItem[]): string[] {
  return items
    .map((item) => normalizeSpeechText(item.label))
    .filter((label): label is string => label !== null);
}

function truncateByWords(value: string): string {
  const words = value.split(" ");
  if (words.length <= MAX_SECTION_WORDS) {
    return value;
  }

  return `${words.slice(0, MAX_SECTION_WORDS).join(" ")}...`;
}

function getConciseSectionContent(section: StudyGuideSection): string | null {
  const content = normalizeSpeechText(section.content);
  if (!content) return null;

  const sentences = content.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [content];
  const concise = sentences
    .slice(0, MAX_SECTION_SENTENCES)
    .map((sentence) => sentence.trim())
    .join(" ");

  return truncateByWords(concise);
}

function addLabelGroup(parts: string[], heading: string, items: ExtractionItem[]) {
  const labels = itemLabels(items);
  if (labels.length > 0) {
    parts.push(ensureSentence(`${heading}: ${labels.join("; ")}`));
  }
}

export function buildStudyBriefNarrationText(studyGuide: StudyGuide): string {
  const parts: string[] = ["Study Brief."];
  const summary = normalizeSpeechText(studyGuide.overview.summary);
  const topic = normalizeSpeechText(studyGuide.overview.topic);
  const dueDate = normalizeSpeechText(studyGuide.overview.due_date);
  const estimatedTime = normalizeSpeechText(studyGuide.overview.estimated_time);

  if (summary) parts.push(ensureSentence(`Summary: ${summary}`));
  if (topic) parts.push(ensureSentence(`Topic: ${topic}`));
  if (dueDate) parts.push(ensureSentence(`Due date: ${dueDate}`));
  if (estimatedTime) parts.push(ensureSentence(`Estimated time: ${estimatedTime}`));

  addLabelGroup(parts, "Key actions", studyGuide.key_actions);
  addLabelGroup(parts, "Important details", [
    ...studyGuide.important_details.dates,
    ...studyGuide.important_details.policies,
    ...studyGuide.important_details.contacts,
    ...studyGuide.important_details.logistics,
  ]);
  addLabelGroup(parts, "Checklist", studyGuide.checklist);

  const sectionParts = studyGuide.sections
    .map((section, index) => {
      const title = normalizeSpeechText(section.title);
      const content = getConciseSectionContent(section);

      if (!title && !content) return null;

      return ensureSentence(
        [`Section ${index + 1}`, title, content].filter(Boolean).join(": ")
      );
    })
    .filter((part): part is string => part !== null);

  if (sectionParts.length > 0) {
    parts.push(`Sections: ${sectionParts.join(" ")}`);
  }

  return parts.join(" ");
}
