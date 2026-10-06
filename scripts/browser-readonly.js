async (page) => {
  await page.unrouteAll({ behavior: "wait" })
  const results = []
  const check = (condition, name) => {
    if (!condition) throw new Error(name)
    results.push(name)
  }
  await page.goto("http://127.0.0.1:4173/preview/")
  await page
    .locator(".face")
    .waitFor({ timeout: 30000 })
  await page
    .locator(".estimate-row strong")
    .filter({ hasText: "FREE1376" })
    .waitFor({ timeout: 15000 })
  check(
    (await page.locator("img").count()) === 1,
    "Only the live face is an image",
  )
  check(
    (await page.locator("img").getAttribute("src")).startsWith(
      "data:image/svg+xml",
    ),
    "Face is an SVG data URI in img",
  )
  check(
    (await page.locator(".contract-status").innerText()).startsWith(
      "ENSLAVED.",
    ),
    "Live contract status shown",
  )
  check(
    (await page.locator(".manifesto").count()) === 0 &&
      (await page.getByText("SEALED.", { exact: true }).isVisible()),
    "Live unburied testament is sealed and has no manifesto element",
  )
  const layouts = []
  for (const [width, height] of [
    [320, 740],
    [375, 667],
    [375, 812],
    [768, 1024],
    [1440, 1100],
  ]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => scrollTo(0, 0))
    const layout = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      buyBottom: document
        .querySelector(".primary-button")
        .getBoundingClientRect().bottom,
      faceWidth: document.querySelector(".face").getBoundingClientRect().width,
      faceBottom: document.querySelector(".face").getBoundingClientRect().bottom,
      headlineTop: document.querySelector("h1").getBoundingClientRect().top,
    }))
    check(
      layout.scrollWidth <= width,
      `No horizontal overflow at ${width}×${height}`,
    )
    if (width <= 640)
      check(
        layout.faceWidth >= 280 && layout.faceBottom < layout.headlineTop,
        `Large face precedes headline at ${width}×${height}`,
      )
    layouts.push(layout)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await page.getByRole("button", { name: "Use 0.05 ETH", exact: true }).click()
  check(
    (await page.getByLabel("you pay").inputValue()) === "0.05",
    "Quick amount updates input",
  )
  await page.getByRole("radio", { name: "10%", exact: true }).check()
  check(
    await page.getByText("High slippage:", { exact: false }).isVisible(),
    "High slippage warning",
  )
  await page.getByRole("radio", { name: "3%", exact: true }).check()
  await page.getByRole("tab", { name: "Buy", exact: true }).focus()
  await page.keyboard.press("ArrowRight")
  check(
    (await page
      .getByRole("tab", { name: "Sell", exact: true })
      .getAttribute("aria-selected")) === "true",
    "Keyboard tab direction switching",
  )
  check(
    await page.locator(".approvals").isVisible(),
    "Sell approval checklist disclosed",
  )
  await page.keyboard.press("ArrowLeft")
  await page.getByLabel("you pay").fill("0")
  await page
    .getByRole("button", { name: "Connect wallet to buy", exact: false })
    .click()
  check(
    await page.getByText("Enter an amount greater than zero.").isVisible(),
    "Zero amount gives inline error",
  )
  check(
    await page
      .getByLabel("you pay")
      .evaluate((el) => document.activeElement === el),
    "Invalid amount receives focus",
  )
  await page.getByLabel("you pay").fill("0.01")
  await page
    .getByRole("button", { name: "Connect wallet to buy", exact: false })
    .click()
  check(
    await page.getByRole("dialog").isVisible(),
    "Trade opens native wallet chooser",
  )
  check(
    await page
      .getByRole("link", { name: "MetaMask", exact: false })
      .isVisible(),
    "Mobile MetaMask deep link",
  )
  check(
    await page
      .getByRole("link", { name: "Coinbase Wallet", exact: false })
      .isVisible(),
    "Mobile Coinbase deep link",
  )
  check(
    await page.getByRole("link", { name: "Trust", exact: false }).isVisible(),
    "Mobile Trust deep link",
  )
  await page.keyboard.press("Escape")
  check(
    !(await page.getByRole("dialog").isVisible()),
    "Escape closes wallet chooser",
  )
  check(
    await page
      .locator(".primary-button")
      .evaluate((el) => document.activeElement === el),
    "Dialog returns focus to trade trigger",
  )
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page
    .getByRole("button", { name: "Copy token / verified", exact: true })
    .click()
  check(
    (await page.evaluate(() => navigator.clipboard.readText())) ===
      "0x4543e6b511a9a7a75b56607e27997c987ea05878",
    "Copy button copies complete token address",
  )
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%"
  })
  check(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "200% text enlargement reflows at 375px",
  )
  await page.evaluate(() => {
    document.documentElement.style.fontSize = ""
  })
  return { results, layouts }
}
