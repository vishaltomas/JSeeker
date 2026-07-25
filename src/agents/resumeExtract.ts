import * as fs from "fs";
import { PDFParse } from "pdf-parse";

// Resumes are short documents; this is generous headroom for an LLM prompt
// while keeping requests small and fast against local models.
const MAX_CHARS = 6000;

/** Extracts plain text from a PDF resume for the onboarding extraction step. */
export async function extractPdfText(filePath: string): Promise<string> {
  const data = fs.readFileSync(filePath);
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_CHARS);
  } finally {
    await parser.destroy();
  }
}
