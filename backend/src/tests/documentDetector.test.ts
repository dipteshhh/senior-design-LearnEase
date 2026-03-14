import test from "node:test";
import assert from "node:assert/strict";
import { detectDocumentType } from "../services/documentDetector.js";

// ── First-match-wins basics (per CLASSIFICATION.md §2) ──────────────

test("classifier rejects syllabus as UNSUPPORTED", () => {
  const text =
    "Course syllabus with grading policy, late work rules, and course schedule includes assignment details.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("classifier detects homework after syllabus check", () => {
  const text = "Homework assignment due date and submit instructions.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("classifier detects lecture when homework and syllabus triggers are absent", () => {
  const text = "Lecture slides for module week chapter learning objectives.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("classifier returns unsupported for empty input", () => {
  const result = detectDocumentType("   ");
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("classifier returns unsupported for generic text with no triggers", () => {
  const text = "The quick brown fox jumped over the lazy dog.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Single-trigger classification (per CLASSIFICATION.md §2) ────────

test("single trigger 'slides' classifies as LECTURE", () => {
  const text = "Slides for today's session on data structures.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("single trigger 'grading' is no longer a supported trigger", () => {
  const text = "Course grading breakdown and policies.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("single trigger 'week' classifies as LECTURE", () => {
  const text = "Week 5: Introduction to algorithms.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

// ── Documents with no triggers → UNSUPPORTED ────────────────────────

test("project report with no triggers is UNSUPPORTED", () => {
  const text =
    "Project Report: Database Design and Implementation. Results and analysis included.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("research paper with no triggers is UNSUPPORTED", () => {
  const text =
    "Research paper on machine learning. This covers related work and conclusions.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Mixed-signal documents should be classified by overall profile ───

test("project report with 'submit' and 'due date' stays UNSUPPORTED", () => {
  const text =
    "Project Report: Database Design. Submit your project report by the due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("research paper with 'assignment' stays UNSUPPORTED", () => {
  const text =
    "Research paper assignment. Submit your draft by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("lab report with assignment language stays UNSUPPORTED", () => {
  const text =
    "Lab report assignment due date and submit instructions.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("lecture slides on case study classifies as LECTURE", () => {
  const text = "Lecture slides on case study analysis.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("capstone project assignment classifies as HOMEWORK", () => {
  const text =
    "Capstone project assignment 1. Submit by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});

test("capstone project syllabus classifies as UNSUPPORTED", () => {
  const text =
    "Capstone Project course syllabus with grading policy and course schedule.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("homework mentioning thesis statement classifies as HOMEWORK", () => {
  const text =
    "Homework: Write a thesis statement and submit by due date.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("technical report writing lecture classifies as LECTURE", () => {
  const text =
    "Technical report writing lecture slides for week 2.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("real homework sheet with due date and submission instructions classifies as HOMEWORK", () => {
  const text =
    "Assignment 01\n" +
    "Max points: 100\n" +
    "Due: 10/12/2025 at 11:59pm\n" +
    "Your submission must be written entirely in your own words.\n" +
    "Question 1: Implement scaled dot-product attention.\n" +
    "Question 2: Write a 2-3 page summary (typed, PDF).";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("machine learning homework handout classifies as HOMEWORK", () => {
  const text =
    "Machine Learning: Homework Assignment 1\n" +
    "The assignment is due at 1:30pm on Wednesday, January 21, 2009.\n" +
    "To submit your code, please send it as an attachment via email.\n" +
    "Implement the basic decision tree learning algorithm.\n" +
    "Question 1. What are the accuracies over the training set and test set?";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("lecture PDF 01A course introduction deck stays LECTURE despite syllabus and homework references", () => {
  const text =
    "Spring 2026\n" +
    "Lecture 01: Course Introduction\n" +
    "Welcome to EECS 4560 / 5560 / 6980\n" +
    "Instructor: Dr. Larry Thomas\n" +
    "Office Hours: Still TBD\n" +
    "We meet at: M/W 9:35 - 10:55 AM (lecture)\n" +
    "We meet in: NE 2105 / RC 301: FOR EXAMS ONLY\n" +
    "Lectures in Blackboard Collaborate.\n" +
    "About me\n" +
    "Philosophy for the Course\n" +
    "Our Database Platform\n" +
    "One Sticky Point\n" +
    "About the Textbook(s): Textbook (required).\n" +
    "My Lectures: Almost universally PowerPoint presentations.\n" +
    "I will post my slides to Blackboard AFTER the lecture.\n" +
    "A note about lectures in general.\n" +
    "Assignments will be submitted via Blackboard (as .7z archives - see syllabus).\n" +
    "Your homework will be submitted as MS Word files.\n" +
    "Academic Integrity: You may not post any class materials online.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("lecture PDF 01B chapter introduction deck stays LECTURE despite invoice examples", () => {
  const text =
    "Lecture 01B: Chapter 01 - Introduction to Relational Databases and SQL\n" +
    "Chapter 1 - Objectives\n" +
    "After completing this chapter, you should be able to describe tables, rows, and cells.\n" +
    "Continued next slide...\n" +
    "Tables typically model entities such as invoices, customers, students, vendors, employees.\n" +
    "The InvoiceID in the Invoice table is the Invoice's PK.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("lecture deck with course logistics and policy slides stays LECTURE", () => {
  const text =
    "Lecture 02: Course Expectations\n" +
    "Slides for week 2 module.\n" +
    "Office hours, academic integrity, and technology requirements.\n" +
    "Lecture slides will be posted after class.\n" +
    "See the syllabus for archive-format submission rules.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("lecture deck with textbook chapter objectives stays LECTURE", () => {
  const text =
    "Lecture 03: Chapter 02 - Data Modeling\n" +
    "Chapter Objectives\n" +
    "After completing this chapter, you should be able to explain ER modeling.\n" +
    "Textbook chapter coverage and concept explanation slides continue next slide.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("weaker lecture deck with isolated syllabus mention stays LECTURE", () => {
  const text =
    "Lecture 04: Query Optimization\n" +
    "Chapter 4 overview and learning objectives.\n" +
    "Slides explain join ordering, cost models, and execution plans.\n" +
    "See syllabus for archive-format submission rules.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("weaker lecture deck with isolated amount due mention stays LECTURE", () => {
  const text =
    "Lecture 05: Entity Relationships\n" +
    "Chapter objectives and concept overview.\n" +
    "Slides explain why amount due belongs in an invoice example table.\n" +
    "Lecture discussion compares invoices, customers, and orders.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("weaker lecture deck with isolated portfolio mention stays LECTURE", () => {
  const text =
    "Lecture 06: Career Applications of UX Research\n" +
    "Module agenda and learning objectives.\n" +
    "Slides explain how to present course projects in a portfolio after graduation.\n" +
    "Concept overview and discussion prompts continue next slide.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

test("weaker lecture deck with isolated transcript mention stays LECTURE", () => {
  const text =
    "Lecture 07: Advising and Degree Planning\n" +
    "Week 7 lecture slides with learning objectives.\n" +
    "Concept explanation covers how transcript data maps to prerequisite checks.\n" +
    "Chapter overview and examples continue next slide.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});

// ── Class notes acceptance (normalized to LECTURE) ───────────────────

test("class notes document classifies as LECTURE", () => {
  const text = "Class notes for Introduction to Psychology.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("course notes document classifies as LECTURE", () => {
  const text = "Course notes on database design principles.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

test("notes: prefix classifies as LECTURE", () => {
  const text = "Notes: key concepts from today's biology session.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
});

// ── Negative trigger rejection ──────────────────────────────────────

test("resume is rejected as UNSUPPORTED", () => {
  const text = "Resume: John Smith. Experience in software engineering.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("portfolio is rejected as UNSUPPORTED", () => {
  const text = "Portfolio of design work and creative projects.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("cover letter is rejected as UNSUPPORTED", () => {
  const text = "Cover letter for the position of software engineer.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("letter of recommendation is rejected as UNSUPPORTED", () => {
  const text = "Letter of recommendation for Jane Doe.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("academic transcript is rejected as UNSUPPORTED", () => {
  const text = "Academic Transcript. Official transcript with cumulative GPA and grade points.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("invoice is rejected as UNSUPPORTED", () => {
  const text = "Invoice number 1042. Billing statement with amount due.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("class schedule is rejected as UNSUPPORTED", () => {
  const text = "Class schedule for Fall 2025 semester.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("course schedule is rejected as UNSUPPORTED", () => {
  const text = "Course schedule with weekly topics and exam dates.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("syllabi plural is rejected as UNSUPPORTED", () => {
  const text = "Collection of syllabi for the department.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

// ── Negative triggers take priority over positive triggers ──────────

test("syllabus with lecture triggers is still UNSUPPORTED", () => {
  const text =
    "Course syllabus including grading policy and course schedule for each week.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("academic transcript with lecture triggers is still UNSUPPORTED", () => {
  const text = "Official transcript with cumulative GPA and lecture schedule notes.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("homework mentioning office hours is still HOMEWORK", () => {
  const text = "Homework 2. Submit by due date. Office hours are posted separately.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
});

test("award approval email with headers is rejected as UNSUPPORTED", () => {
  const text =
    "From: Student Awards studentawards@lastmile-ed.org\n" +
    "Subject: Congratulations! Your Financial Support Application Has Been Approved\n" +
    "Date: February 24, 2026 at 11:09 AM\n" +
    "To: student@example.com\n" +
    "Award Details:\nAward Amount: $1,744.69\nAccept Your Award in the Student Application Portal.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("financial support award notice without full email header still rejects", () => {
  const text =
    "Your financial support application has been approved.\n" +
    "Award Details: Award Amount $1,744.69.\n" +
    "Accept Your Award to begin disbursement for tuition payout.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
});

test("insurance brochure with policy sections is rejected as UNSUPPORTED", () => {
  const text =
    "International Student Health Insurance\n" +
    "General Information\n" +
    "Claims Information\n" +
    "Policy Benefits\n" +
    "Policy Pricing\n" +
    "Policy Exclusions\n" +
    "Deductible, Copayments, Coinsurance, and Explanation of Benefits.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("policy brochure with claims and benefits vocabulary is rejected as UNSUPPORTED", () => {
  const text =
    "Plan Participant ID Card\n" +
    "Description of Coverage\n" +
    "Claims Information and claim form instructions\n" +
    "Deductible and copayment tables for insurance coverage.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("research co-op approval form is rejected as UNSUPPORTED", () => {
  const text =
    "RESEARCH CO-OP APPROVAL FORM\n" +
    "STATEMENT OF EXPECTATIONS\n" +
    "Co-op Semester: Spring 2026\n" +
    "Start Date: January 21, 2026 End Date: May 5, 2026\n" +
    "Supervisor/Professor Name: Dr. Example\n" +
    "Institution Name: University of Toledo\n" +
    "Department Name: Electrical Engineering\n" +
    "Faculty Signature:\nStudent Signature:";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("academic administrative form with GradLeaders and CPT is rejected as UNSUPPORTED", () => {
  const text =
    "Approval Form\n" +
    "Statement of Expectations\n" +
    "Start Date: January 21, 2026 End Date: May 5, 2026\n" +
    "Report your approved research as a co-op in GradLeaders.\n" +
    "International Students may need work authorization and CPT approval.\n" +
    "Faculty Signature and Student Signature required.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("weekly project progress report is rejected as UNSUPPORTED", () => {
  const text =
    "Weekly Progress Report\n" +
    "Project Status Summary (Percentage Completed: 80%)\n" +
    "Individual Contributions\n" +
    "Next Week's SMART Goals\n" +
    "Action/Task Plan\n" +
    "Open Issues, Risks, Change Requests\n" +
    "Milestones and Deliverables\n" +
    "Faculty Advisor";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("status report with milestones and advisor section is rejected as UNSUPPORTED", () => {
  const text =
    "Project Status Summary\n" +
    "Percentage Completed: 65%\n" +
    "Individual Contributions by team member\n" +
    "Milestones and Deliverables\n" +
    "Status Note\n" +
    "Open Issues, Risks, Change Requests\n" +
    "Project Faculty Advisor signature";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("research proposal is rejected as UNSUPPORTED", () => {
  const text =
    "Research Proposal\n" +
    "Proposed Faculty Supervisor: Dr. Example\n" +
    "Research Objectives\n" +
    "Scope of Work\n" +
    "Proposed Datasets\n" +
    "Methodology\n" +
    "Timeline & Milestones\n" +
    "Expected Outcomes";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("academic planning proposal with supervisor role and milestones is rejected as UNSUPPORTED", () => {
  const text =
    "Project Proposal\n" +
    "Co-op Period: January 21, 2026 - May 5, 2026\n" +
    "Student Responsibilities\n" +
    "Faculty Supervisor Role\n" +
    "Research Objectives\n" +
    "Methodology\n" +
    "Timeline and Milestones\n" +
    "Expected Outcomes";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("rental agreement is rejected as UNSUPPORTED", () => {
  const text =
    "Thrifty Rental Agreement\n" +
    "Rental Record# 422397172\n" +
    "Vehicle: 2025 ALTIMA\n" +
    "Rental Rate 3 @ $52.02 per day\n" +
    "Service Charges/Taxes\n" +
    "TOTAL ESTIMATED CHARGE $268.96\n" +
    "Credit Card Authorization Amount $469.00\n" +
    "Rental Time: 03/02/26 at 12:11PM\n" +
    "Return Time: 03/05/26 at 10:30AM";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("transactional receipt-style document is rejected as UNSUPPORTED", () => {
  const text =
    "Booking Confirmation\n" +
    "Receipt\n" +
    "Service Charges and Taxes\n" +
    "Total Charge $189.20\n" +
    "Credit Card Authorization\n" +
    "Rental Location: Airport Counter\n" +
    "Return Location: Downtown Office";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "UNSUPPORTED");
  assert.equal(result.isAssignment, false);
});

test("supported homework is not rejected by admin award rules", () => {
  const text =
    "Homework 6 assignment. Submit your answers by the due date and include screenshots from ADS / SSMS.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "HOMEWORK");
  assert.equal(result.isAssignment, true);
});

test("supported class notes are not rejected by insurance brochure rules", () => {
  const text =
    "Class notes for week 5 lecture on health policy modeling and coverage estimation.";
  const result = detectDocumentType(text);
  assert.equal(result.documentType, "LECTURE");
  assert.equal(result.isAssignment, false);
});
