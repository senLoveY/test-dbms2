import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import zlib from "node:zlib";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

/**
 * Article text from a link, for quiz generation. The server fetches someone
 * else's URL, so it must never be steered at private networks or cloud metadata:
 * addresses are checked when the socket connects (after DNS), and again on
 * every redirect.
 */

const LIMITS = {
  maxBytes: 3 * 1024 * 1024,
  timeoutMs: 10_000,
  maxRedirects: 3,
};

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isBlockedAddress(address) {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

class SourceError extends Error {}

/** Only plain web pages on standard ports; returns a URL or throws a user-facing error. */
export function checkArticleUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || "").trim());
  } catch {
    throw new SourceError("Это не похоже на ссылку");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SourceError("Нужна ссылка на страницу (http или https)");
  }
  if (url.username || url.password) throw new SourceError("Ссылки с логином не поддерживаются");
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new SourceError("Ссылки на нестандартный порт не поддерживаются");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) ? isBlockedAddress(host) : /(^|\.)(localhost|local|internal)$/i.test(host)) {
    throw new SourceError("Эта ссылка ведёт во внутреннюю сеть");
  }
  return url;
}

/** Used as the socket's DNS lookup: the address is checked right before connecting. */
export function safeLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => isBlockedAddress(address))) {
      return callback(Object.assign(new Error("blocked address"), { code: "EBLOCKED" }));
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

function decompress(response) {
  const encoding = String(response.headers["content-encoding"] || "").toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return response.pipe(zlib.createGunzip());
  if (encoding === "deflate") return response.pipe(zlib.createInflate());
  if (encoding === "br") return response.pipe(zlib.createBrotliDecompress());
  return response;
}

function request(url, deadline) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; QuizMaker/1.0; +study quiz generator)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          "Accept-Encoding": "gzip, deflate, br",
          "Accept-Language": "ru,en;q=0.8",
        },
        timeout: Math.max(1, deadline - Date.now()),
      },
      (response) => {
        const status = response.statusCode || 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ redirect: new URL(response.headers.location, url) });
          return;
        }
        if (status >= 400) {
          response.resume();
          reject(new SourceError(`Сайт ответил ошибкой ${status}`));
          return;
        }

        const chunks = [];
        let size = 0;
        const body = decompress(response);
        body.on("data", (chunk) => {
          size += chunk.length;
          if (size > LIMITS.maxBytes) {
            req.destroy();
            reject(new SourceError("Страница слишком большая"));
            return;
          }
          chunks.push(chunk);
        });
        body.on("end", () => resolve({ response, body: Buffer.concat(chunks) }));
        body.on("error", () => reject(new SourceError("Не удалось прочитать ответ сайта")));
      }
    );
    req.on("timeout", () => req.destroy(new SourceError("Сайт не ответил вовремя")));
    req.on("error", (error) => {
      if (error instanceof SourceError) reject(error);
      else if (error.code === "EBLOCKED") reject(new SourceError("Эта ссылка ведёт во внутреннюю сеть"));
      else if (error.code === "ENOTFOUND") reject(new SourceError("Такой сайт не найден"));
      else reject(new SourceError("Не удалось открыть ссылку"));
    });
  });
}

function charsetOf(contentType, body) {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  const head = body.subarray(0, 4096).toString("latin1");
  return head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] || "utf-8";
}

function decode(body, charset) {
  try {
    return new TextDecoder(charset.toLowerCase()).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function tidy(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Main article text of an HTML page (Readability, the engine of Firefox reader view). */
export function extractArticle(html, url) {
  const { document } = parseHTML(html);
  let article = null;
  try {
    article = new Readability(document, { charThreshold: 200 }).parse();
  } catch {
    article = null;
  }
  const title = tidy(article?.title || document.querySelector("title")?.textContent || "");
  let text = tidy(article?.textContent);
  if (text.length < 200) {
    const fallback = parseHTML(html).document;
    fallback.querySelectorAll("script, style, noscript, nav, header, footer, aside, form").forEach((node) => node.remove());
    text = tidy(fallback.body?.textContent || "");
  }
  return { title, text, url: String(url) };
}

export async function fetchArticle(rawUrl) {
  try {
    let url = checkArticleUrl(rawUrl);
    const deadline = Date.now() + LIMITS.timeoutMs;

    for (let hop = 0; hop <= LIMITS.maxRedirects; hop += 1) {
      const result = await request(url, deadline);
      if (result.redirect) {
        url = checkArticleUrl(result.redirect.href);
        continue;
      }

      const contentType = String(result.response.headers["content-type"] || "").toLowerCase();
      if (contentType.includes("application/pdf")) {
        return { error: "Это PDF — скачайте его и загрузите файлом" };
      }
      if (contentType && !/text\/html|application\/xhtml|text\/plain/.test(contentType)) {
        return { error: "По ссылке не веб-страница" };
      }

      const content = decode(result.body, charsetOf(contentType, result.body));
      const article = contentType.includes("text/plain")
        ? { title: "", text: tidy(content), url: url.href }
        : extractArticle(content, url);
      if (article.text.length < 200) {
        return { error: "На странице почти нет текста — возможно, он подгружается скриптом или закрыт входом" };
      }
      return article;
    }
    return { error: "Слишком много перенаправлений" };
  } catch (error) {
    if (error instanceof SourceError) return { error: error.message };
    throw error;
  }
}
