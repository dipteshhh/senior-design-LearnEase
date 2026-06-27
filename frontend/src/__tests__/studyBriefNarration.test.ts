import test from "node:test";
import assert from "node:assert/strict";
import type { StudyGuide } from "@/lib/contracts";
import { buildStudyBriefNarrationText } from "@/lib/studyBriefNarration";

function makeStudyGuide(overrides: Partial<StudyGuide> = {}): StudyGuide {
  return {
    overview: {
      title: "Week 4 Brief",
      document_type: "LECTURE",
      summary: "This lecture introduces graph traversal strategies.",
      topic: "Graph search",
      due_date: "2026-07-02",
      estimated_time: "45 minutes",
    },
    key_actions: [
      {
        id: "action-1",
        label: "Review breadth-first search",
        supporting_quote: "supporting quote for breadth-first search",
        citations: [
          {
            source_type: "pdf",
            page: 3,
            excerpt: "citation excerpt for breadth-first search",
          },
        ],
      },
    ],
    checklist: [
      {
        id: "check-1",
        label: "Trace the sample graph by hand",
        supporting_quote: "supporting quote for sample graph",
        citations: [
          {
            source_type: "docx",
            anchor_type: "paragraph",
            paragraph: 9,
            excerpt: "citation excerpt for sample graph",
          },
        ],
      },
    ],
    important_details: {
      dates: [
        {
          id: "detail-1",
          label: "Quiz opens Friday",
          supporting_quote: "supporting quote for quiz opening",
          citations: [],
        },
      ],
      policies: [],
      contacts: [],
      logistics: [],
    },
    sections: [
      {
        id: "section-1",
        title: "Breadth-first search",
        content:
          "Start with the source vertex and visit neighbors level by level. Keep a queue of discovered vertices. This third sentence should stay out of the concise narration.",
        citations: [
          {
            source_type: "pdf",
            page: 4,
            excerpt: "citation excerpt for breadth-first section",
          },
        ],
      },
    ],
    ...overrides,
  };
}

test("buildStudyBriefNarrationText includes Study Guide summary fields and labels", () => {
  const narration = buildStudyBriefNarrationText(makeStudyGuide());

  assert.match(narration, /Summary: This lecture introduces graph traversal strategies\./);
  assert.match(narration, /Topic: Graph search\./);
  assert.match(narration, /Due date: 2026-07-02\./);
  assert.match(narration, /Estimated time: 45 minutes\./);
  assert.match(narration, /Key actions: Review breadth-first search\./);
  assert.match(narration, /Important details: Quiz opens Friday\./);
  assert.match(narration, /Checklist: Trace the sample graph by hand\./);
  assert.match(narration, /Section 1: Breadth-first search:/);
});

test("buildStudyBriefNarrationText excludes supporting quotes and citation excerpts", () => {
  const narration = buildStudyBriefNarrationText(makeStudyGuide());

  assert.doesNotMatch(narration, /supporting quote/i);
  assert.doesNotMatch(narration, /citation excerpt/i);
});

test("buildStudyBriefNarrationText keeps section content concise", () => {
  const narration = buildStudyBriefNarrationText(makeStudyGuide());

  assert.match(
    narration,
    /Start with the source vertex and visit neighbors level by level\./
  );
  assert.match(narration, /Keep a queue of discovered vertices\./);
  assert.doesNotMatch(narration, /This third sentence should stay out/);
});

test("buildStudyBriefNarrationText skips optional overview fields when absent", () => {
  const narration = buildStudyBriefNarrationText(
    makeStudyGuide({
      overview: {
        title: "Untitled",
        document_type: "LECTURE",
        summary: "Short summary.",
        topic: null,
        due_date: null,
        estimated_time: null,
      },
    })
  );

  assert.doesNotMatch(narration, /Topic:/);
  assert.doesNotMatch(narration, /Due date:/);
  assert.doesNotMatch(narration, /Estimated time:/);
});
