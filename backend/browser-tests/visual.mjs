import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
process.env.AUTO_COOK = "false";
process.env.LATENCY_MS = "0";
const require = createRequire(import.meta.url);
const { app } = require("../server.js");
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_CHANNEL
      ? { channel: process.env.CHROME_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".dish-card").first().waitFor();
    await page.locator("#searchInput").fill("pa");
    await page.locator(".suggest-item").first().waitFor();
    const suggestions = await page
      .locator(".suggest-item")
      .evaluateAll((items) =>
        items.map((el) => {
          const b = el.getBoundingClientRect();
          const hit = document.elementFromPoint(
            b.x + b.width / 2,
            b.y + b.height / 2,
          );
          return el === hit || el.contains(hit);
        }),
      );
    assert.ok(suggestions.length > 0 && suggestions.every(Boolean));
    const resetResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === "/api/menu" &&
        !url.searchParams.get("q") &&
        url.searchParams.get("page") === "1"
      );
    });
    await page.locator("#searchInput").fill("");
    const reset = await (await resetResponse).json();
    await page.waitForFunction(
      (total) =>
        document
          .querySelector("#resultCount")
          ?.textContent.includes(`total ${total}`),
      reset.total,
    );
    await page.locator("#themeBtn").click();
    const theme = await page
      .locator(".dish-body")
      .first()
      .evaluate((el) => ({
        color: getComputedStyle(el).color,
        ink: getComputedStyle(document.documentElement)
          .getPropertyValue("--ink")
          .trim(),
      }));
    assert.equal(theme.color, "rgb(242, 232, 223)");
    for (const width of [360, 390, 600, 800, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Overflow at ${width}px`,
      );
    }
    await page.setViewportSize({ width: 800, height: 900 });
    const favorite = page.locator(".fav-btn").first();
    // Pagination can replace the cards while the viewport changes. A normal
    // pointer action retries a detached element until the current card is stable.
    await favorite.hover();
    const hit = await favorite.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const found = document.elementFromPoint(
        b.x + b.width / 2,
        b.y + b.height / 2,
      );
      return el === found || el.contains(found);
    });
    assert.ok(hit);
    const old = await favorite.getAttribute("aria-pressed");
    await favorite.click();
    assert.notEqual(await favorite.getAttribute("aria-pressed"), old);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => window.scrollY > 300);
    await page.locator(".filters").waitFor();
    const sticky = await page.locator(".filters").evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      header: document.querySelector(".site-header").getBoundingClientRect()
        .bottom,
    }));
    assert.ok(Math.abs(sticky.top - sticky.header) < 3, JSON.stringify(sticky));
    assert.deepEqual(errors, []);
    console.log(
      `PASS Task 1 visual checks: ${suggestions.length} clickable suggestions, dark-theme text, no overflow at 360/390/600/800/1280px, tablet favorite clicks, mobile sticky filters; no browser exceptions.`,
    );
  } finally {
    await browser.close();
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
