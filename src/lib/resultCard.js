/**
 * Square result card in the exam-sheet style, drawn on a canvas so it can be shared as an image.
 * Always light: it ends up in chats and stories, not in the app.
 */
const SIZE = 1080;
const MARGIN_X = 150;
const COLORS = {
  paper: "#f6f6f3",
  rule: "rgba(40, 60, 100, 0.08)",
  margin: "rgba(215, 38, 61, 0.5)",
  ink: "#17181a",
  ink2: "#45474b",
  ink3: "#6e7075",
  marker: "#e4f33a",
  pen: "#d7263d",
};
const FONTS = {
  serif: '"Literata", Georgia, serif',
  sans: '"Onest", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

async function loadFonts(sample) {
  if (!document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`600 64px ${FONTS.serif}`, sample),
    document.fonts.load(`italic 600 64px ${FONTS.serif}`, sample),
    document.fonts.load(`500 32px ${FONTS.sans}`, sample),
    document.fonts.load(`500 28px ${FONTS.mono}`, sample),
  ]).catch(() => {});
}

function wrapLines(ctx, text, maxWidth, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last.trimEnd()}…`;
  }
  return lines;
}

function drawPaper(ctx) {
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = COLORS.rule;
  ctx.lineWidth = 2;
  for (let p = 36; p < SIZE; p += 36) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, SIZE);
    ctx.moveTo(0, p);
    ctx.lineTo(SIZE, p);
    ctx.stroke();
  }
  ctx.strokeStyle = COLORS.margin;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN_X - 40, 0);
  ctx.lineTo(MARGIN_X - 40, SIZE);
  ctx.stroke();
}

function drawBrand(ctx) {
  const x = MARGIN_X;
  const y = 110;
  ctx.fillStyle = COLORS.marker;
  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(x, y, 52, 52, 8);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(x + 13, y + 27);
  ctx.lineTo(x + 23, y + 37);
  ctx.lineTo(x + 41, y + 16);
  ctx.stroke();

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 38px ${FONTS.serif}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Тесты и состязания", x + 76, y + 28);
}

/** A grade circled by hand in red pen. */
function drawStamp(ctx, text, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.09);
  ctx.font = `italic 600 ${text.length > 3 ? 64 : 84}px ${FONTS.serif}`;
  const width = ctx.measureText(text).width;
  const rx = width / 2 + 44;
  const ry = 74;
  ctx.strokeStyle = COLORS.pen;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0.15, Math.PI * 2 - 0.05);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(3, -2, rx + 6, ry + 4, 0.03, Math.PI * 1.7, Math.PI * 2.25);
  ctx.stroke();
  ctx.fillStyle = COLORS.pen;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 0, 4);
  ctx.restore();
  return rx;
}

/**
 * @param {{ kind: string, title: string, score: number, total: number, separator?: string,
 *           stamp?: string, caption?: string }} card
 * Short stamps (a grade, a percent) sit next to the score; longer ones ("Победа") go in the corner.
 */
export async function drawResultCard({ kind, title, score, total, separator = "/", stamp, caption }) {
  await loadFonts(`${title}${kind}${caption || ""}0123456789/%`);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");

  drawPaper(ctx);
  drawBrand(ctx);

  const textWidth = SIZE - MARGIN_X - 110;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 30px ${FONTS.mono}`;
  ctx.fillText(kind.toUpperCase().split("").join(" "), MARGIN_X, 290);

  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 62px ${FONTS.serif}`;
  const lines = wrapLines(ctx, title, textWidth, 3);
  lines.forEach((line, index) => ctx.fillText(line, MARGIN_X, 370 + index * 76));

  const scoreY = 370 + lines.length * 76 + 250;
  const shortStamp = stamp && stamp.length <= 4;
  const scoreText = String(score);
  const totalText = `${separator}${total}`;
  const scoreRoom = textWidth - (shortStamp ? 260 : 0);
  ctx.font = `600 280px ${FONTS.serif}`;
  const fullWidth = ctx.measureText(scoreText + totalText).width;
  const scoreSize = Math.min(280, Math.floor((280 * scoreRoom) / fullWidth));
  ctx.font = `600 ${scoreSize}px ${FONTS.serif}`;
  ctx.fillText(scoreText, MARGIN_X - 10, scoreY);
  const scoreWidth = ctx.measureText(scoreText).width;
  ctx.fillStyle = COLORS.ink3;
  ctx.fillText(totalText, MARGIN_X - 10 + scoreWidth, scoreY);
  const totalWidth = ctx.measureText(totalText).width;

  if (shortStamp) {
    drawStamp(ctx, stamp, Math.min(SIZE - 170, MARGIN_X + scoreWidth + totalWidth + 150), scoreY - scoreSize * 0.4);
  } else if (stamp) {
    drawStamp(ctx, stamp, SIZE - 260, 250);
  }

  if (caption) {
    ctx.fillStyle = COLORS.ink2;
    ctx.font = `500 36px ${FONTS.sans}`;
    ctx.fillText(caption, MARGIN_X, Math.min(scoreY + 90, SIZE - 120));
  }

  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 26px ${FONTS.mono}`;
  ctx.fillText(window.location.host, MARGIN_X, SIZE - 60);

  return canvas;
}

/** Share sheet with the image on phones; download elsewhere. */
export async function shareResultCard(card) {
  const canvas = await drawResultCard(card);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const file = new File([blob], "result.png", { type: "image/png" });

  if (navigator.canShare?.({ files: [file] }) && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ files: [file], title: card.title, text: `${card.kind}: ${card.score}/${card.total}` });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "result.png";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
