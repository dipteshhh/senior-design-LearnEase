import winkNLP from 'wink-nlp';
import model from 'wink-eng-lite-web-model';

const nlp = winkNLP(model);
const its = nlp.its;
const as = nlp.as;

// ... existing imports ...
export const processAcademicText = (text: string) => {
  const doc = nlp.readDoc(text);
  const sentences = doc.sentences().out(its.value, as.array) as string[];

  // 1. Existing Deadline Detection
  const potentialDeadlines = sentences.filter((s) => {
    const content = s.toLowerCase();
    return content.includes('due') || content.includes('deadline');
  });

  // 2. New Requirement Detection (Formats and Lengths)
  const potentialRequirements = sentences.filter((s) => {
    const content = s.toLowerCase();
    return content.includes('format') || 
           content.includes('word') || 
           content.includes('cite') || 
           content.includes('submission');
  });

  return {
    documentSummary: {
      totalSentences: sentences.length,
      charCount: text.length,
    },
    extractedMetadata: {
      deadlines: potentialDeadlines,
      requirements: potentialRequirements, // Added this line
    },
    status: "Privacy-safe processing complete"
  };
};