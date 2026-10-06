async (page) => {
  await page.unrouteAll({ behavior: "wait" })
  const results = []
  const check = (ok, label) => {
    if (!ok) throw new Error(label)
    results.push(label)
  }
  const f = await (
    await page.request.get("http://127.0.0.1:4173/fixtures.json")
  ).json()
  let state = "freed",
    burnError = "Pool4Unavailable",
    simulations = []
  const handler = async (route) => {
    const body = route.request().postDataJSON(),
      tx = body.params?.[0]
    if (
      body.method === "eth_call" &&
      tx.to.toLowerCase() === f.addr.hook.toLowerCase()
    ) {
      if (f.states[state][tx.data])
        return route.fulfill({
          json: {
            jsonrpc: "2.0",
            id: body.id,
            result: f.states[state][tx.data],
          },
        })
      if (
        [
          f.selectors.manumit,
          f.selectors.burnTrue,
          f.selectors.burnFalse,
        ].includes(tx.data)
      ) {
        simulations.push(tx.data)
        if (tx.data === f.selectors.burnTrue && burnError)
          return route.fulfill({
            json: {
              jsonrpc: "2.0",
              id: body.id,
              error: {
                code: 3,
                message: "execution reverted",
                data: f.errors[burnError],
              },
            },
          })
        return route.fulfill({
          json: { jsonrpc: "2.0", id: body.id, result: "0x" },
        })
      }
    }
    await route.continue()
  }
  await page.route(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    handler,
  )
  await page.goto("http://127.0.0.1:4173/preview/")
  await page
    .getByText("FREED, NOT BURIED", { exact: true })
    .waitFor({ timeout: 30000 })
  check(
    await page
      .getByRole("button", { name: "Free the seat", exact: false })
      .isVisible(),
    "Funded state exposes Free the seat",
  )
  await page.evaluate((creator) => {
    window.__hookCalls = []
    const provider = {
      request: async (request) => {
        window.__hookCalls.push(request)
        if (
          request.method === "eth_requestAccounts" ||
          request.method === "eth_accounts"
        )
          return [creator]
        if (request.method === "eth_chainId") return "0x1"
        if (request.method === "eth_sendTransaction")
          throw { code: 4001, message: "User rejected" }
        throw new Error("Unexpected " + request.method)
      },
    }
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "hook-test", name: "Hook test wallet" },
          provider,
        },
      }),
    )
  }, f.addr.creator)
  await page.locator(".wallet-button").click()
  await page
    .getByRole("button", { name: "Hook test wallet", exact: false })
    .click()
  await page
    .getByRole("button", { name: "Free the seat", exact: false })
    .click()
  await page
    .locator(".hook-feedback")
    .getByText("Request declined in your wallet. You can try again.", {
      exact: true,
    })
    .waitFor()
  check(
    simulations.includes(f.selectors.manumit),
    "manumit is simulated before wallet submission",
  )
  check(
    await page.evaluate(
      (data) =>
        window.__hookCalls.some(
          (c) =>
            c.method === "eth_sendTransaction" && c.params[0].data === data,
        ),
      f.selectors.manumit,
    ),
    "Free the seat submits manumit calldata",
  )
  state = "buried"
  await page.getByRole("button", { name: "refresh", exact: true }).click()
  await page
    .getByRole("button", { name: "Burn IMD", exact: false })
    .waitFor({ timeout: 15000 })
  check(
    await page.getByText("500 IMD burned", { exact: true }).isVisible(),
    "Buried state shows chain burn total",
  )
  await page.getByRole("button", { name: "Burn IMD", exact: false }).click()
  await page
    .locator(".hook-feedback")
    .getByText("Request declined in your wallet. You can try again.", {
      exact: true,
    })
    .waitFor()
  check(
    simulations.includes(f.selectors.burnTrue) &&
      simulations.includes(f.selectors.burnFalse),
    "Pool4Unavailable falls back to a simulated plain route",
  )
  check(
    await page.evaluate(
      (data) =>
        window.__hookCalls.some(
          (c) =>
            c.method === "eth_sendTransaction" && c.params[0].data === data,
        ),
      f.selectors.burnFalse,
    ),
    "Only successful burn route reaches wallet",
  )
  for (const [name, message] of [
    ["NothingToBurn", "not enough fees to burn yet"],
    ["PriceOffReference", "price is off its reference, try later"],
  ]) {
    burnError = name
    const before = await page.evaluate(
      () =>
        window.__hookCalls.filter((c) => c.method === "eth_sendTransaction")
          .length,
    )
    await page.getByRole("button", { name: "Burn IMD", exact: false }).click()
    await page
      .locator(".hook-feedback")
      .getByText(message, { exact: false })
      .waitFor()
    check(
      (await page.evaluate(
        () =>
          window.__hookCalls.filter((c) => c.method === "eth_sendTransaction")
            .length,
      )) === before,
      `${name} stops submission and explains the failure next to the action`,
    )
  }
  await page.unroute(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    handler,
  )
  return {
    results,
    note: "Future chain states and writes simulated; no transaction broadcast.",
  }
}
