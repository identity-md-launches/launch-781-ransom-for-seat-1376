import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright-core";

// Serve the actual export at a gateway-style subpath; no RPC mocks or rewrites.
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const path = resolve(
      "dist",
      pathname.replace(/^\/preview\//, "") || "index.html",
    );
    assert.ok(
      pathname.startsWith("/preview/") &&
        path.startsWith(resolve("dist") + "/"),
    );
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".txt": "text/plain",
    };
    res
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const report = {
  checkedAt: new Date().toISOString(),
  browser: browser.version(),
  visits: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
};
page.on("pageerror", (error) => report.pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.consoleErrors.push(message.text());
});
page.on("requestfailed", (request) =>
  report.failedRequests.push({
    url: request.url(),
    failure: request.failure(),
  }),
);
await page.addInitScript(() => {
  window.offerReady = undefined;
  const observer = new MutationObserver(() => {
    const rows = [
      ...document.querySelectorAll("#offer-title + .offer-rows .offer-row"),
    ];
    if (
      rows.length === 3 &&
      rows.every((row) => row.textContent.trim().endsWith("✓"))
    ) {
      window.offerReady = {
        milliseconds: performance.now(),
        rows: rows.map((row) => row.textContent),
      };
      observer.disconnect();
    }
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
});
await mkdir("test/scratch", { recursive: true });
try {
  for (const width of [1440, 360]) {
    await page.goto("about:blank");
    await page.setViewportSize({ width, height: 1000 });
    const requests = [];
    const collect = (request) => {
      if (request.url() !== "https://eth.drpc.org/") return;
      const body = request.postDataJSON();
      const batch = Array.isArray(body) ? body : [body];
      requests.push({
        methods: batch.map((rpc) => rpc.method),
        at: Date.now(),
      });
    };
    page.on("request", collect);
    const began = Date.now();
    await page.goto(
      `http://127.0.0.1:${server.address().port}/preview/#second-act`,
    );
    await page.waitForFunction(() => window.offerReady, null, {
      timeout: 60000,
      polling: 50,
    });
    const ready = await page.evaluate(() => window.offerReady);
    const navigationStart = await page.evaluate(() => performance.timeOrigin);
    const untilReady = requests.filter(
      (request) => request.at <= navigationStart + ready.milliseconds,
    );
    assert.ok(
      untilReady.length > 0,
      "Every measurement must be a fresh live document visit",
    );
    assert.ok(
      requests.every((request) => !request.methods.includes("eth_getLogs")),
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false);
    await page.waitForFunction(
      () =>
        document.querySelector(".paid-receipt")?.getAttribute("aria-busy") ===
        "false",
      null,
      { timeout: 60000 },
    );
    const screenshot = `test/scratch/bisection-live-${width}.jpg`;
    await page.screenshot({
      path: screenshot,
      type: "jpeg",
      quality: 72,
      fullPage: true,
    });
    report.visits.push({
      width,
      checkedAt: new Date(began).toISOString(),
      offerRowsSecondsFromNavigation: ready.milliseconds / 1000,
      allPageDrpcHttpRequestsUntilRows: untilReady.length,
      allPageDrpcRpcCallsUntilRows: untilReady.reduce(
        (sum, request) => sum + request.methods.length,
        0,
      ),
      scope:
        "All page dRPC traffic until ticks; includes record, paid history, chart, burial and sell quote",
      rows: ready.rows,
      overflow,
      screenshot,
    });
    page.off("request", collect);
  }
  assert.equal(report.pageErrors.length, 0);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await writeFile(
    "test/scratch/bisection-live-browser.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((done) => server.close(done));
}
