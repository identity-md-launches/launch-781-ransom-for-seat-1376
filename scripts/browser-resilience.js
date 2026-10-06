async (page) => {
  await page.unrouteAll({ behavior: "wait" })
  const results = []
  const fail = (route) => route.abort("failed")
  await page.route("https://ethereum-rpc.publicnode.com/**", fail)
  await page.goto("http://127.0.0.1:4173/preview/")
  await page
    .getByText("✓ matches MANIFESTO_HASH on Ethereum")
    .waitFor({ timeout: 30000 })
  results.push(
    "Read-only mode recovers through eth.drpc.org when PublicNode fails",
  )
  await page.route("https://eth.drpc.org/**", fail)
  await page.getByRole("button", { name: "refresh", exact: true }).click()
  await page
    .getByText("Live reads are unavailable.", { exact: false })
    .waitFor({ timeout: 30000 })
  if (!(await page.locator(".face").isVisible()))
    throw new Error("Previous face unexpectedly removed")
  results.push(
    "Both RPC failures mark retained data as out of date and offer refresh",
  )
  await page.goto("http://127.0.0.1:4173/preview/")
  await page
    .getByText("face unavailable", { exact: true })
    .waitFor({ timeout: 30000 })
  if ((await page.locator(".paid-line").innerText()).includes("1."))
    throw new Error("Unexpected fabricated ransom")
  results.push(
    "Initial RPC failure shows placeholders instead of invented live numbers",
  )
  await page.unrouteAll({ behavior: "wait" })
  await page.getByRole("button", { name: "refresh", exact: true }).click()
  await page
    .getByText("✓ matches MANIFESTO_HASH on Ethereum")
    .waitFor({ timeout: 30000 })
  results.push("Refresh restores live data after an outage")
  return { results }
}
