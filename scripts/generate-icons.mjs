import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

// Run check:mainnet first. Render the actual hero image as an img, never SVG markup.
const snapshot = JSON.parse(
  await readFile("/tmp/free1376-fixtures/snapshot.json", "utf8"),
);
const svg = await readFile("public/favicon.svg", "utf8");
const ring = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [size, file] of [
    [32, "favicon-32.png"],
    [180, "apple-touch-icon.png"],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<body style="margin:0;background:#030303"><img width="${size}" height="${size}" alt="Key ring"></body>`,
    );
    await page.locator("img").evaluate((el, src) => {
      el.src = src;
    }, ring);
    await page.locator("img").evaluate((el) => el.decode());
    await page.screenshot({ path: `public/${file}` });
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;background:#030303;color:#f5f1eb;font-family:SFMono-Regular,Consolas,"Liberation Mono",Menlo,monospace}
    main{height:630px;padding:64px;display:flex;gap:64px;align-items:center}
    .frame{width:440px;flex-shrink:0;padding:16px;border:1px solid #352c27}
    img{width:406px;display:block;outline:1px solid #ffffff1a}
    .text{flex:1}h1{font-size:58px;line-height:1.1;letter-spacing:-.065em;margin:0 0 24px;font-weight:700}
    p{color:#fdba74;font-size:44px;margin:0;letter-spacing:-.04em} .line{height:3px;background:linear-gradient(110deg,#f97316,#fdba74 48%,#22d3ee);margin-top:36px}
  </style><main><div class="frame"><img alt="Seat 1376"></div><div class="text"><h1>SEAT #1376</h1><p>$FREE1376</p><div class="line"></div></div></main>`);
  await page.locator("img").evaluate((el, src) => {
    el.src = src;
  }, snapshot.metadata.image);
  await page.locator("img").evaluate((el) => el.decode());
  await page.screenshot({ path: "public/og.png" });
} finally {
  await browser.close();
}
console.log(
  "Generated 32px and 180px ring icons and 1200×630 hero-face preview.",
);
