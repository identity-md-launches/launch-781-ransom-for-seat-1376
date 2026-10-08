import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright-core";
const report = {
  checkedAt: new Date().toISOString(),
  errors: [],
  console: [],
  layouts: [],
};
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const path = resolve(
      "dist",
      pathname.replace(/^\/preview\//, "") || "index.html",
    );
    if (
      !pathname.startsWith("/preview/") ||
      !path.startsWith(resolve("dist") + "/")
    )
      throw Error("path");
    res
      .writeHead(200, {
        "Content-Type":
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
          }[extname(path)] || "text/plain",
      })
      .end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROMIUM_PATH ||
    "/opt/imd-tools/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(60000);
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") report.console.push(m.text());
});
await page.route(
  /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
  async (route) => {
    try {
      const res = await fetch(route.request().url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: route.request().postData(),
      });
      await route.fulfill({
        status: res.status,
        contentType: "application/json",
        body: await res.text(),
      });
    } catch (e) {
      report.errors.push(String(e));
      await route.abort();
    }
  },
);
try {
  await page.goto(
    `http://127.0.0.1:${server.address().port}/preview/#second-act`,
  );
  await page.locator(".live-swap-row").nth(6).waitFor();
  await page.waitForFunction(
    () =>
      document
        .querySelector(".live-chart svg")
        ?.getAttribute("aria-valuemax") === "23",
  );
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll(".live-swap-impact")].some(
        (e) => e.textContent === "—",
      ),
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  report.screenshotMotion = "reduced (deterministic Chromium repaint)";
  await page.waitForTimeout(1200);
  report.meter = await page
    .locator('.live-percentage [role="img"]')
    .getAttribute("aria-label");
  report.bag = await page
    .locator('.live-bag-row [role="img"]')
    .getAttribute("aria-label");
  report.block = await page.locator(".live-block-pill").innerText();
  report.swaps = await page
    .locator(".live-swap-row")
    .evaluateAll((els) =>
      els.map((e) => ({ text: e.innerText, href: e.href })),
    );
  await page
    .locator(".live-paid-sections")
    .screenshot({ path: "artifacts/swap-mainnet-desktop.png" });
  for (const width of [320, 360, 560, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    report.layouts.push(
      await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
      })),
    );
  }
  await page.setViewportSize({ width: 360, height: 1000 });
  await page.waitForTimeout(1100);
  await page
    .locator(".live-paid-sections")
    .screenshot({ path: "artifacts/swap-mainnet-mobile.png" });
  const pairs = await page
    .locator(
      '.live-block-pill b,.live-quote-label,.live-swap-row b,.live-swap-tokens,.live-chart-switch [aria-pressed="true"]',
    )
    .evaluateAll((els) =>
      els.map((e) => {
        const s = getComputedStyle(e);
        let node = e,
          bg = s.backgroundColor;
        while (bg === "rgba(0, 0, 0, 0)" && node.parentElement) {
          node = node.parentElement;
          bg = getComputedStyle(node).backgroundColor;
        }
        return {
          selector: e.className || e.tagName,
          color: s.color,
          background: bg,
        };
      }),
    );
  const lum = (s) =>
    s
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  report.contrast = pairs.map((p) => ({
    ...p,
    ratio:
      (Math.max(lum(p.color), lum(p.background)) + 0.05) /
      (Math.min(lum(p.color), lum(p.background)) + 0.05),
  }));
  report.result = "passed";
} catch (e) {
  report.result = "failed";
  report.failure = String(e);
  process.exitCode = 1;
} finally {
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/live-fixes-render.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  await new Promise((r) => server.close(r));
}
