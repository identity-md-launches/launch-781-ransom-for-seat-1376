import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright-core"
);
const { default: AxeBuilder } = await import(
  process.env.AXE_MODULE || "@axe-core/playwright"
);
const root = resolve("dist");
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--no-sandbox"],
});
const report = {
  checkedAt: new Date().toISOString(),
  originChecks: [],
  contrast: [],
  accessibility: [],
  errors: [],
  interaction: [],
  limitations: [
    "Static application responses are intercepted from dist at each named origin; this does not publish the site. RPC responses are direct mainnet.",
    "No screen-reader session, native zoom, native SF Mono, physical phone, RTL/localization, or Animations-panel slow playback.",
  ],
};
try {
  for (const host of ["free1376.sites.imd.fun", "free1376.eth.limo"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 1000 },
    });
    await context.route(`https://${host}/**`, async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const path = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (!path.startsWith(root + "/")) return route.abort();
      await route.fulfill({
        status: 200,
        contentType:
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
            ".png": "image/png",
          }[extname(path)] || "text/plain",
        body: await readFile(path),
      });
    });
    const page = await context.newPage(),
      providers = new Set();
    page.on("pageerror", (error) => report.errors.push(error.message));
    page.on("response", (r) => {
      if (r.url().startsWith("https:") && !r.url().includes(host))
        providers.add(new URL(r.url()).host);
    });
    await page.goto(`https://${host}/#second-act`);
    await page.waitForFunction(() => {
      const e = document.querySelector(".live-paid-sections");
      return (
        e?.dataset.liveComplete === "true" && e.dataset.burnComplete === "true"
      );
    });
    report.originChecks.push({
      host,
      providers: [...providers],
      complete: true,
      seconds: await page.evaluate(() => performance.now() / 1000),
    });
    if (host === "free1376.sites.imd.fun") {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.locator(".live-chart-switch button").nth(1).click();
      await page.locator(".live-chart svg").focus();
      await page.keyboard.press("Home");
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await page.locator(".live-chart svg").getAttribute("aria-valuenow"),
        "1",
      );
      await page
        .locator(".live-chart-section")
        .screenshot({ path: "artifacts/chart-keyboard.png" });
      report.interaction.push(
        "Visible focused chart, arrow selection after Home",
      );
      await page
        .locator(".live-chart svg")
        .hover({ position: { x: 100, y: 120 } });
      assert.ok(await page.locator(".live-chart-selected").count());
      report.interaction.push("Pointer selects a chart point");
      await page.locator("summary").first().click();
      assert.ok(await page.locator("details[open]").count());
      await page.locator("summary").first().click();
      report.interaction.push("Nine-wallet disclosure opens and closes");
      const pairs = await page
        .locator(
          ".live-quote-label,.live-chart-switch button,.live-block-pill b,.live-swap-row b",
        )
        .evaluateAll((els) =>
          els.map((el) => {
            const s = getComputedStyle(el);
            let p = el,
              bg = s.backgroundColor;
            while (bg === "rgba(0, 0, 0, 0)" && p.parentElement) {
              p = p.parentElement;
              bg = getComputedStyle(p).backgroundColor;
            }
            return {
              text: el.textContent,
              color: s.color,
              background: bg,
              font: s.fontFamily,
              fontSize: s.fontSize,
            };
          }),
        );
      const luminance = (color) =>
        color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) => (n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4))
          .reduce((a, n, i) => a + n * [0.2126, 0.7152, 0.0722][i], 0);
      report.contrast = pairs.map((p) => ({
        ...p,
        ratio:
          (Math.max(luminance(p.color), luminance(p.background)) + 0.05) /
          (Math.min(luminance(p.color), luminance(p.background)) + 0.05),
      }));
      for (const width of [320, 560, 1280]) {
        await page.setViewportSize({ width, height: 1000 });
        const results = await new AxeBuilder({ page })
          .include(".live-paid-sections")
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        report.accessibility.push({
          width,
          violations: results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            targets: v.nodes.map((n) => n.target),
          })),
        });
        assert.equal(results.violations.length, 0);
      }
    }
    await context.close();
  }
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = String(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    "artifacts/chart-review.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
}
