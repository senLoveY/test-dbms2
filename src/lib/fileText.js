/**
 * Pulls plain text out of a study file in the browser, so only text
 * (not the file itself) goes to the API. PDF and DOCX parsers load lazily.
 */

export const SOURCE_FILE_ACCEPT = ".pdf,.docx,.txt,.md,text/plain,text/markdown,application/pdf";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

function extensionOf(name) {
  return name.toLowerCase().split(".").pop();
}

async function readPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  const { default: workerUrl } = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    pages.push(
      content.items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join("")
    );
  }
  return pages.join("\n\n");
}

async function readDocx(file) {
  const { default: mammoth } = await import("mammoth/mammoth.browser.js");
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

export async function extractFileText(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Файл больше 20 МБ");

  const ext = extensionOf(file.name);
  let text;
  if (ext === "pdf") text = await readPdf(file);
  else if (ext === "docx") text = await readDocx(file);
  else if (ext === "txt" || ext === "md") text = await file.text();
  else throw new Error("Поддерживаются PDF, DOCX, TXT и MD");

  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) {
    throw new Error(
      ext === "pdf"
        ? "В PDF нет текста — похоже, это скан. Нужен PDF с текстовым слоем."
        : "В файле нет текста"
    );
  }
  return clean;
}
