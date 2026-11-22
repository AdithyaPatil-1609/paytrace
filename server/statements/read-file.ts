/**
 * Browser only: turns a chosen statement file into CSV text for the import.
 * A CSV is read as text; a PDF is opened here with pdf.js (a password-protected
 * one asks for its password, which never leaves the device) and its table is
 * converted by server/statements/pdf.ts. Only that CSV text is ever uploaded.
 */
import { STATEMENT_LIMITS } from "./csv";
import { pdfWordsToCsv, type PdfWord } from "./pdf";

export type StatementFile = { ok: true; csv: string } | { ok: false; error: string; cancelled?: boolean };
/** Asked when the PDF is locked; `retry` is true after a wrong password. Null means the person cancelled. */
export type AskPassword = (retry: boolean) => Promise<string | null>;

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;
export const isPdf = (file: File) => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

async function pdfWords(data: Uint8Array, askPassword: AskPassword): Promise<PdfWord[] | StatementFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
  let password: string | undefined;
  for (let attempt = 0; ; attempt++) {
    try {
      // No eval, no fonts or network: the file is only read for its text.
      const doc = await pdfjs.getDocument({ data: data.slice(), password, isEvalSupported: false, disableFontFace: true, stopAtErrors: false }).promise;
      try {
        if (doc.numPages > STATEMENT_LIMITS.maxPdfPages) return { ok: false, error: `The PDF has ${doc.numPages} pages; the limit is ${STATEMENT_LIMITS.maxPdfPages}. Download a shorter period, such as 12 months.` };
        const words: PdfWord[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          for (const item of content.items) {
            if (!("str" in item) || !item.str.trim()) continue;
            words.push({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width, page: n });
          }
          page.cleanup();
        }
        return words;
      } finally { void doc.destroy(); }
    } catch (error) {
      if ((error as { name?: string })?.name !== "PasswordException") return { ok: false, error: "This PDF could not be opened. Download the statement again, or use the CSV download." };
      password = (await askPassword(attempt > 0)) ?? undefined;
      if (password === undefined) return { ok: false, error: "Import cancelled.", cancelled: true };
    }
  }
}

export async function statementFileToCsv(file: File, askPassword: AskPassword): Promise<StatementFile> {
  if (!isPdf(file)) {
    if (file.size > STATEMENT_LIMITS.maxBytes) return { ok: false, error: `The file is larger than ${kb(STATEMENT_LIMITS.maxBytes)}. Export a shorter period, such as 12 months.` };
    return { ok: true, csv: await file.text() };
  }
  if (file.size > STATEMENT_LIMITS.maxPdfBytes) return { ok: false, error: `The PDF is larger than ${kb(STATEMENT_LIMITS.maxPdfBytes)}. Download a shorter period, such as 12 months.` };
  const words = await pdfWords(new Uint8Array(await file.arrayBuffer()), askPassword);
  if (!Array.isArray(words)) return words;
  const result = pdfWordsToCsv(words);
  if (!result.ok) return result;
  if (new Blob([result.csv]).size > STATEMENT_LIMITS.maxBytes) return { ok: false, error: "This statement has too many lines for one import. Download a shorter period, such as 12 months." };
  return { ok: true, csv: result.csv };
}
