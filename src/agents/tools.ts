import {readFileSync} from 'fs';
import { ipcMain } from "electron";
import { PDFParse } from "pdf-parse";

/** Cap on returned PDF text — a job description or resume fits well inside
 * this, and an unbounded document would otherwise blow up the prompt. */
const MAX_PDF_CHARS = 6000;

// create a custom Tool Error
class ToolError extends Error{
    constructor(message:string) {
        super(message);
        this.name = this.constructor.name;
    }
}
/**
 * Tools for agent to interact
 */
export async function WebLinkReader(url:string): Promise<string>{
    /**
     * Fetches the html links from the site or fetch the content
     */
    const response = await fetch(url);
    if (!response.ok) throw new ToolError(`${WebLinkReader.name} : `);
    const result = await response.text();
    return result;
}

export async function PDFReader(pdf_url:string, maxChars:number = MAX_PDF_CHARS): Promise<string>{
    /**
     * Reads the pdf content and extract all the keywords and texts.
     * Takes either a local path or an http(s)/www URL — job postings and
     * resumes arrive both ways, and the agent shouldn't have to know which.
     */
    let data: Buffer;
    if (/^(https?:\/\/|www\.)/i.test(pdf_url)) {
        // A bare `www.` host has no scheme for fetch to work with.
        const href = /^www\./i.test(pdf_url) ? `https://${pdf_url}` : pdf_url;
        const response = await fetch(href);
        if (!response.ok) throw new ToolError(`${PDFReader.name} : ${response.status} ${response.statusText} for ${href}`);
        data = Buffer.from(await response.arrayBuffer());
    } else {
        try {
            data = readFileSync(pdf_url);
        } catch (e) {
            throw new ToolError(`${PDFReader.name} : cannot read ${pdf_url} — ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    const parser = new PDFParse({ data });
    try {
        const result = await parser.getText();
        // Same normalisation as the onboarding extractor: PDF text layers come
        // out with ragged whitespace that only wastes prompt tokens.
        const text = result.text
            .replace(/[ \t]+/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        if (!text) throw new ToolError(`${PDFReader.name} : no extractable text in ${pdf_url} (scanned or image-only PDF?)`);
        return text.slice(0, maxChars);
    } catch (e) {
        if (e instanceof ToolError) throw e;
        throw new ToolError(`${PDFReader.name} : failed to parse ${pdf_url} — ${e instanceof Error ? e.message : String(e)}`);
    } finally {
        await parser.destroy();
    }
}

export async function ResumeWriter(content:JSON){
    /**
     * Reads the content from the profiles and use it to create Resume.
     * Connects the Resume Builder. Uses the resb format
     */
}


export async function CoverLetterWriter(content: JSON){
    /**
     * Reads the conten from the profiles and use it to write the cover letter
     */
}


// export async function 



