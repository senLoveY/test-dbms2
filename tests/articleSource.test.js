import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkArticleUrl, extractArticle, isBlockedAddress, safeLookup } from "../lib/articleSource.js";

describe("article links: private networks are off limits", () => {
  it("blocks private, loopback, link-local and metadata addresses", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  it("rejects non-web, odd-port, credentialed and local links up front", () => {
    for (const bad of ["file:///etc/passwd", "ftp://x.ru/a", "http://x.ru:8080/", "http://user:pw@x.ru/", "http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://169.254.169.254/latest/meta-data/", "не ссылка"]) {
      assert.throws(() => checkArticleUrl(bad), undefined, bad);
    }
    assert.equal(checkArticleUrl("https://ru.wikipedia.org/wiki/Нормальная_форма").hostname, "ru.wikipedia.org");
  });

  it("refuses to connect when a hostname resolves to a private address", async () => {
    // "localhost" resolves locally to 127.0.0.1 / ::1 without any outside DNS
    const error = await new Promise((resolve) => safeLookup("localhost", {}, (err) => resolve(err)));
    assert.equal(error?.code, "EBLOCKED");
  });
});

describe("article extraction", () => {
  const paragraph = "Нормализация — это процесс организации данных в базе, который уменьшает избыточность и устраняет аномалии вставки, обновления и удаления. ";
  const html = `<!doctype html><html><head><title>Нормальные формы — Учебник</title></head><body>
    <nav>Главная | Курсы | Войти</nav>
    <article><h1>Нормальные формы</h1><p>${paragraph.repeat(4)}</p><p>Первая нормальная форма требует атомарных значений. ${paragraph}</p></article>
    <footer>© 2026 Реклама и куки</footer><script>track()</script></body></html>`;

  it("keeps the article and drops navigation, footer and scripts", () => {
    const { title, text } = extractArticle(html, "https://example.org/nf");
    assert.match(title, /Нормальные формы/);
    assert.match(text, /атомарных значений/);
    assert.doesNotMatch(text, /Войти|Реклама|track\(\)/);
  });
});
