import { processAcademicText } from './src/services/aiEngine/NlpProcessor.ts';

const sampleAssignment = `
  Introduction to Computer Science
  Assignment 1: Data Structures
  Due Date: February 15, 2026
  
  Please write a 500-word essay on the importance of Linked Lists. 
  Ensure you cite at least three sources. 
  Submission should be in PDF format.
`;

const result = processAcademicText(sampleAssignment);
console.log("--- NLP Test Results ---");
console.log(result);