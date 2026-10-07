import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright-core";
import AxeBuilder from "@axe-core/playwright";
import revision from "./browser-revision.mjs";
import acts from "./browser-acts.mjs";

await mkdir("artifacts", { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const path =
      pathname === "/fixtures.json"
        ? "/tmp/free1376-fixtures/fixtures.json"
        : resolve("dist", pathname.replace(/^\/preview\//, "") || "index.html");
    if (
      pathname !== "/fixtures.json" &&
      !path.startsWith(resolve("dist") + "/")
    )
      throw new Error("Invalid path");
    const data = await readFile(path);
    response
      .writeHead(200, {
        "Content-Type": types[extname(path)] || "application/octet-stream",
      })
      .end(data);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(4173, "127.0.0.1", resolve);
});
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const consoleErrors = [],
  failedResources = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("requestfailed", (request) => {
  if (request.url().startsWith("http://127.0.0.1"))
    failedResources.push(request.url());
});
const report = {
  checkedAt: new Date().toISOString(),
  browser: browser.version(),
  checks: {},
};
try {
  for (const name of ["readonly", "wallet", "hook", "resilience"]) {
    const run = (0, eval)(
      `(${await readFile(`scripts/browser-${name}.js`, "utf8")})`,
    );
    report.checks[name] = await run(page);
    console.log(`${name}: ${report.checks[name].results.length} checks passed`);
  }
  report.checks.revision = await revision(page);
  console.log(
    `revision: ${report.checks.revision.results.length} checks passed`,
  );
  report.checks.acts = await acts(page);
  console.log(`acts: ${report.checks.acts.results.length} checks passed`);
  await page.goto("http://127.0.0.1:4173/preview/");
  await page.locator(".face").waitFor({ timeout: 30000 });
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "FREE1376" })
    .waitFor();
  const axe = await new AxeBuilder({ page }).analyze();
  report.axe = {
    violations: axe.violations,
    passes: axe.passes.length,
    incomplete: axe.incomplete.map(({ id, impact, description }) => ({
      id,
      impact,
      description,
    })),
  };
  report.consoleErrors = consoleErrors;
  report.failedLocalResources = failedResources;
  // The unchanged trade form has this minor ARIA best-practice finding.
  // The assignment permits only four product changes; retain and report it.
  report.retainedBaselineFindings = axe.violations.filter(
    (v) =>
      v.id === "aria-allowed-role" &&
      v.nodes.every(
        (n) => n.target.length === 1 && n.target[0] === "#trade-fields",
      ),
  );
  const newViolations = axe.violations.filter(
    (v) => !report.retainedBaselineFindings.includes(v),
  );
  if (consoleErrors.length || failedResources.length || newViolations.length)
    throw new Error("Browser/axe findings require review");
  await page.emulateMedia({ reducedMotion: "reduce" });
  report.reducedMotion = await page
    .locator(".primary-button")
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  if (report.reducedMotion !== "0s")
    throw new Error("Reduced motion transition should be absent");
  report.completed = true;
} catch (error) {
  report.completed = false;
  report.error = error.stack;
  await page.screenshot({
    path: "/tmp/free1376-browser-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await writeFile(
    "artifacts/browser-checks.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
console.log("Browser validation complete; artifacts/browser-checks.json");
