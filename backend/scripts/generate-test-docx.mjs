#!/usr/bin/env node
// Generates minimal valid DOCX files for E2E testing.
// DOCX is a ZIP containing XML files. We use Node's built-in zlib to create them.

import { writeFileSync } from "fs";
import { deflateRawSync } from "zlib";

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    // Local file header
    const local = Buffer.alloc(30 + nameBuffer.length + compressed.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // compression: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    nameBuffer.copy(local, 30);
    compressed.copy(local, 30 + nameBuffer.length);
    localHeaders.push(local);

    // Central directory header
    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(8, 10); // compression
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30); // extra field length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    nameBuffer.copy(central, 46);
    centralHeaders.push(central);

    offset += local.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0);

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central dir
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function makeDocx(paragraphs) {
  const contentTypes = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "utf8"
  );

  const rels = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "utf8"
  );

  const wordRels = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`,
    "utf8"
  );

  const bodyParagraphs = paragraphs
    .map(
      (p) =>
        `<w:p><w:r><w:t xml:space="preserve">${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</w:t></w:r></w:p>`
    )
    .join("\n");

  const document = Buffer.from(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyParagraphs}
  </w:body>
</w:document>`,
    "utf8"
  );

  return createZip([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rels },
    { name: "word/_rels/document.xml.rels", data: wordRels },
    { name: "word/document.xml", data: document },
  ]);
}

// ── Generate homework DOCX ──────────────────────────────────
const homeworkDocx = makeDocx([
  "Homework Assignment 3: Algorithm Design",
  "Due date: December 15 2025 at 11:59 PM",
  "Submit your solutions via Blackboard before the deadline.",
  "Problem 1: Design a greedy algorithm for the activity selection problem.",
  "Problem 2: Analyze the time complexity of your solution.",
  "Each problem is worth 50 points total.",
  "Late submissions will receive a 10 percent penalty per day.",
  "You must show all work and justify each step of your solution.",
  "Include pseudocode for each algorithm you design.",
  "Clearly state the recurrence relation for any divide and conquer approach.",
]);

// ── Generate lecture DOCX ───────────────────────────────────
const lectureDocx = makeDocx([
  "Lecture 1: Introduction to Data Structures",
  "Module 1 Week 1 Learning Objectives",
  "This lecture covers fundamental data structures including arrays and linked lists.",
  "Students will learn about time complexity analysis for common operations.",
  "Key topics: arrays, linked lists, stacks, queues, and their applications.",
  "Chapter 1 slides cover the theoretical foundations of algorithm analysis.",
  "Arrays provide O(1) random access but O(n) insertion at arbitrary positions.",
  "Linked lists provide O(1) insertion at head but O(n) random access.",
  "A stack is a last-in first-out data structure used in function call management.",
  "A queue is a first-in first-out data structure used in breadth-first search.",
]);

const outDir = process.argv[2] || "/tmp";
writeFileSync(`${outDir}/homework-test.docx`, homeworkDocx);
writeFileSync(`${outDir}/lecture-test.docx`, lectureDocx);
console.log(`Generated: ${outDir}/homework-test.docx`);
console.log(`Generated: ${outDir}/lecture-test.docx`);
