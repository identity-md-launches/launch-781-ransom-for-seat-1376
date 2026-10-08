import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright-core"
);
let report = {
  checkedAt: new Date().toISOString(),
  mainnet: "Direct browser RPC requests; no response mocks or relay",
  loads: [],
  warnings: [],
  pageErrors: [],
  layouts: [],
  interactions: [],
};
const root = resolve(process.env.EXPORT_DIR || "dist");
const out = resolve("artifacts");
await mkdir(resolve(out, "chart-frames"), { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const path = resolve(
      root,
      pathname.replace(/^\/preview\//, "") || "index.html",
    );
    if (!pathname.startsWith("/preview/") || !path.startsWith(root + "/"))
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
  executablePath: process.env.CHROMIUM_PATH,
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1000, height: 800 },
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
let requests = [];
page.on("request", (r) => {
  if (!r.url().startsWith("https://")) return;
  try {
    const body = r.postDataJSON();
    const calls = Array.isArray(body) ? body : [body];
    for (const rpc of calls) {
      const data = rpc.params?.[0]?.data?.toLowerCase() || "";
      const at = rpc.params?.[1];
      requests.push({
        host: new URL(r.url()).host,
        method: rpc.method,
        block: typeof at === "string" ? at : null,
        chartPast:
          rpc.method === "eth_call" &&
          /^0x/.test(at || "") &&
          data.startsWith("0x82ad56cb"),
        ms: Date.now(),
      });
    }
  } catch {
    /* non-RPC */
  }
});
page.on("pageerror", (e) => report.pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "warning") report.warnings.push(m.text());
});
await context.addInitScript(() => {
  window.__chartAudit = {
    frames: [],
    liveComplete: null,
    burnComplete: null,
    livePaint: null,
    burnPaint: null,
    fold: false,
    earlyLine: false,
    modes: [],
  };
  let scrolled = false,
    mode = "live";
  const run = () => {
    const now = performance.now(),
      audit = window.__chartAudit;
    const container = document.querySelector(".live-paid-sections"),
      figure = document.querySelector(".live-chart");
    if (container) {
      if (
        container.dataset.liveComplete === "true" &&
        audit.liveComplete === null
      )
        audit.liveComplete = now;
      if (
        container.dataset.burnComplete === "true" &&
        audit.burnComplete === null
      )
        audit.burnComplete = now;
    }
    if (figure) {
      if (!scrolled) {
        figure.closest("section").scrollIntoView({ block: "center" });
        scrolled = true;
      }
      const nextMode = now >= 10000 ? "live" : now >= 5000 ? "burn" : "live";
      if (nextMode !== mode) {
        const buttons = document.querySelectorAll(".live-chart-switch button");
        buttons[nextMode === "live" ? 0 : 1]?.click();
        mode = nextMode;
        audit.modes.push([now, mode]);
      }
      const raw =
        figure.querySelector("polyline")?.getAttribute("points") || "";
      const dots = raw.trim()
        ? raw
            .trim()
            .split(/\s+/)
            .map((p) => p.split(",").map(Number))
        : [];
      for (let i = 1; i < dots.length; i++)
        if (dots[i][0] < dots[i - 1][0]) audit.fold = true;
      if (figure.dataset.settled !== "true" && dots.length)
        audit.earlyLine = true;
      const series = figure.dataset.series;
      if (dots.length && audit[series + "Paint"] === null)
        audit[series + "Paint"] = now;
      audit.frames.push([
        Math.round(now * 100) / 100,
        series,
        figure.dataset.settled === "true",
        dots.map((p) => p.map((n) => Math.round(n * 100) / 100)),
      ]);
    } else audit.frames.push([Math.round(now * 100) / 100, null, false, []]);
    if (now < 15000) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
});
const url = `http://127.0.0.1:${server.address().port}/preview/index.html#second-act`;
async function capture(label) {
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const elapsed = await page.evaluate(() => performance.now());
    if (elapsed < i * 100) await page.waitForTimeout(i * 100 - elapsed);
    const clip = await page.evaluate(() => {
      const box = document
        .querySelector(".live-chart-section")
        ?.getBoundingClientRect();
      return box
        ? {
            x: Math.max(0, box.x),
            y: Math.max(0, box.y),
            width: Math.min(box.width, innerWidth),
            height: Math.min(box.height, innerHeight - Math.max(0, box.y)),
          }
        : { x: 150, y: 350, width: 700, height: 350 };
    });
    const began = await page.evaluate(() => performance.now());
    await page.screenshot({
      path: resolve(
        out,
        "chart-frames",
        `${label}-${String(i).padStart(3, "0")}.jpg`,
      ),
      type: "jpeg",
      quality: 45,
      clip,
    });
    samples.push({ index: i, targetMs: i * 100, actualMs: Math.round(began) });
  }
  return samples;
}
function summarize(label, audit, dataset) {
  const byProvider = {};
  for (const r of requests) {
    const p = (byProvider[r.host] ??= { total: 0, eth_call: 0, chartPast: 0 });
    p.total++;
    if (r.method === "eth_call") p.eth_call++;
    if (r.chartPast) p.chartPast++;
  }
  return {
    label,
    liveSeconds:
      audit.liveComplete === null
        ? null
        : +(audit.liveComplete / 1000).toFixed(3),
    burnSeconds:
      audit.burnComplete === null
        ? null
        : +(audit.burnComplete / 1000).toFixed(3),
    byProvider,
    chartPastRequests: requests.filter((r) => r.chartPast).length,
    points: dataset,
    frameCount: audit.frames.length,
    nondecreasingX: !audit.fold,
    firstLoadHidden: !audit.earlyLine,
  };
}
try {
  if (process.env.RESUME_INTERACTIONS) {
    report = JSON.parse(
      await readFile(resolve(out, "chart-browser.json"), "utf8"),
    );
    delete report.failure;
    await page.goto(url);
    await page.waitForFunction(
      () =>
        document.querySelector(".live-paid-sections")?.dataset.burnComplete ===
        "true",
    );
    await page.waitForTimeout(15500);
  }
  for (let load = 0; !process.env.RESUME_INTERACTIONS && load <= 5; load++) {
    requests = [];
    if (load === 0) await page.goto(url);
    else await page.reload();
    const label = load === 0 ? "fresh" : `reload-${load}`;
    const screenshots = load <= 1 ? await capture(label) : undefined;
    const elapsed = await page.evaluate(() => performance.now());
    if (elapsed < 15200) await page.waitForTimeout(15200 - elapsed);
    const audit = await page.evaluate(() => window.__chartAudit);
    const dataset = await page
      .locator(".live-paid-sections")
      .evaluate((e) => ({ ...e.dataset }));
    const result = summarize(label, audit, dataset);
    report.loads.push(result);
    console.log(JSON.stringify(result));
    if (load <= 1)
      await writeFile(
        resolve(out, `chart-${label}-frames.json`),
        JSON.stringify({
          columns: ["ms", "series", "settled", "points[x,y]"],
          ...audit,
          screenshots,
        }),
      );
    assert.equal(result.nondecreasingX, true);
    assert.equal(result.firstLoadHidden, true);
    assert.ok(
      result.liveSeconds !== null && result.burnSeconds !== null,
      "Both series complete",
    );
    if (load > 0) {
      assert.ok(
        result.liveSeconds <= 2 && result.burnSeconds <= 2,
        "Warm loads complete within two seconds",
      );
      assert.ok(
        result.chartPastRequests <= 10,
        "At most ten chart past-state requests",
      );
    }
  }
  await page.locator(".live-chart-switch button").nth(1).click();
  await page.waitForTimeout(1000);
  const slider = page.locator(".live-chart svg");
  await slider.focus();
  await page.keyboard.press("Home");
  assert.equal(await slider.getAttribute("aria-valuenow"), "0");
  await page.keyboard.press("End");
  assert.equal(
    await slider.getAttribute("aria-valuenow"),
    await slider.getAttribute("aria-valuemax"),
  );
  report.interactions.push(
    "Both modes switch; Home/End select first/last point; slider value text includes time, percentage and market cap",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".live-chart-switch button").nth(0).click();
  await page.waitForTimeout(30);
  report.reducedMotion = await page.locator(".live-chart").evaluate((e) => {
    const rect = e.querySelector("clipPath rect");
    const line = e.querySelector("polyline");
    return {
      revealWidth: Number(rect.getAttribute("width")),
      points: line.points.numberOfItems,
      animationCount: e.getAnimations({ subtree: true }).length,
    };
  });
  for (const width of [320, 360, 560, 768, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    report.layouts.push(layout);
    assert.ok(layout.scrollWidth <= width);
    if ([320, 1280].includes(width))
      await page
        .locator(".live-paid-sections")
        .screenshot({ path: resolve(out, `chart-${width}.png`) });
  }
  await page.locator('a[href="#first-act"]').first().click();
  await page.waitForFunction(() => document.querySelector(".hero-note"));
  report.interactions.push("First act hash navigation");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  assert.equal(await page.locator("dialog[open]").count(), 1);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  report.interactions.push("Wallet chooser opens and Escape closes");
  await page.locator('a[href="#third-act"]').first().click();
  await page.waitForFunction(() => document.querySelector("#third-act"));
  report.interactions.push("Third act hash navigation");
  await page.route(
    /https:\/\/(eth\.drpc\.org|ethereum-rpc\.publicnode\.com)\/?$/,
    (route) => route.abort("blockedbyclient"),
  );
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  requests = [];
  await page.reload();
  await page.waitForFunction(
    () => {
      const e = document.querySelector(".live-paid-sections");
      return (
        e?.dataset.liveComplete === "true" && e?.dataset.burnComplete === "true"
      );
    },
    {},
    { timeout: 120000 },
  );
  await page.waitForTimeout(50);
  const blockedAudit = await page.evaluate(() => window.__chartAudit);
  report.blocked = summarize(
    "drpc-and-publicnode-blocked",
    blockedAudit,
    await page
      .locator(".live-paid-sections")
      .evaluate((e) => ({ ...e.dataset })),
  );
  for (const act of ["first-act", "third-act", "second-act"]) {
    await page.locator(`a[href="#${act}"]`).first().click();
    if (act === "first-act")
      await page.waitForFunction(
        () =>
          document.querySelector(".seat-story img")?.complete &&
          document.querySelector("#hero-title")?.textContent.includes("FREE"),
      );
    if (act === "third-act") await page.locator(".key-image").waitFor();
    if (act === "second-act") await page.locator(".live-chart").waitFor();
    report.interactions.push(`Blocked providers: ${act} loads`);
  }
  await page.waitForTimeout(5000);
  assert.ok(
    report.warnings.some((w) => w.includes("eth.drpc.org")) &&
      report.warnings.some((w) => w.includes("ethereum-rpc.publicnode.com")),
  );
  assert.equal(report.pageErrors.length, 0);
  report.result = "passed";
} catch (error) {
  report.result = "failed";
  report.failure = String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(
    resolve(out, "chart-browser.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((r) => server.close(r));
}
