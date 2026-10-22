/**
 * Pulls plain text out of a study file in the browser, so only text
 * (not the file itself) goes to the API. PDF, DOCX and PPTX parsers load lazily.
 */

export const SOURCE_FILE_ACCEPT =
  ".pdf,.docx,.pptx,.txt,.md,text/plain,text/markdown,application/pdf";

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

/** Slide text in slide order, then the speaker notes, which often hold the lecture itself. */
async function readPptx(file) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const byNumber = (prefix) =>
    Object.keys(zip.files)
      .map((name) => ({ name, match: name.match(new RegExp(`^ppt/${prefix}(\\d+)\\.xml$`)) }))
      .filter((entry) => entry.match)
      .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
      .map((entry) => entry.name);

  const parser = new DOMParser();
  const paragraphs = async (name) => {
    const doc = parser.parseFromString(await zip.file(name).async("string"), "application/xml");
    return [...doc.getElementsByTagName("a:p")]
      .map((p) => [...p.getElementsByTagName("a:t")].map((t) => t.textContent).join(""))
      .map((line) => line.trim())
      // notes pages carry the slide number as a lone paragraph
      .filter((line) => line && !/^\d+$/.test(line));
  };

  const slides = byNumber("slides/slide");
  const notes = byNumber("notesSlides/notesSlide");
  if (!slides.length) throw new Error("В файле нет слайдов");

  const parts = [];
  for (const [index, name] of slides.entries()) {
    const lines = await paragraphs(name);
    if (lines.length) parts.push(`Слайд ${index + 1}\n${lines.join("\n")}`);
  }
  for (const name of notes) {
    const lines = await paragraphs(name);
    if (lines.length) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export async function extractFileText(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error("Файл больше 20 МБ");

  const ext = extensionOf(file.name);
  let text;
  if (ext === "pdf") text = await readPdf(file);
  else if (ext === "docx") text = await readDocx(file);
  else if (ext === "pptx") text = await readPptx(file);
  else if (ext === "txt" || ext === "md") text = await file.text();
  else throw new Error("Поддерживаются PDF, DOCX, PPTX, TXT и MD");

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
