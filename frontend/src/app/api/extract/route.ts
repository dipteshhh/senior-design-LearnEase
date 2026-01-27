import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

// Dynamic import for pdf-parse to handle CommonJS module
const pdfParse = require('pdf-parse');

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = '';

    // Handle PDF files
    if (file.type === 'application/pdf') {
      try {
        const data = await pdfParse(buffer);
        extractedText = data.text;
      } catch (error) {
        console.error('PDF parsing error:', error);
        return NextResponse.json(
          { error: 'Failed to extract text from PDF' },
          { status: 500 }
        );
      }
    }
    // Handle DOCX files
    else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      try {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } catch (error) {
        console.error('DOCX parsing error:', error);
        return NextResponse.json(
          { error: 'Failed to extract text from DOCX' },
          { status: 500 }
        );
      }
    }
    else {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a PDF or DOCX file.' },
        { status: 400 }
      );
    }

    // Clean up the extracted text
    const cleanedText = extractedText
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanedText) {
      return NextResponse.json(
        { error: 'No text could be extracted from the file' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      text: cleanedText,
      filename: file.name,
      fileType: file.type,
      wordCount: cleanedText.split(' ').length
    });

  } catch (error) {
    console.error('File processing error:', error);
    return NextResponse.json(
      { error: 'Internal server error while processing file' },
      { status: 500 }
    );
  }
}
