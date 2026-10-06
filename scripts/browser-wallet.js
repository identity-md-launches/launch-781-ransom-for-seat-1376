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
  const addr = Object.fromEntries(
    Object.entries(f.addr).map(([k, v]) => [k, v.toLowerCase()]),
  )
  let tokenApproved = false,
    routerApproved = false,
    lastSimulation = ""
  let writes = 0
  const routeHandler = async (route) => {
    const body = route.request().postDataJSON()
    const method = body.method,
      tx = body.params?.[0]
    let result
    if (method === "eth_call") {
      const to = tx.to?.toLowerCase(),
        selector = tx.data?.slice(0, 10)
      if (to === addr.token && selector === f.selectors.balance)
        result = f.balance
      if (to === addr.token && selector === f.selectors.allowance)
        result = tokenApproved ? f.max : f.zero
      if (to === addr.permit2 && selector === f.selectors.permitAllowance)
        result = routerApproved ? f.permitReady : f.permitEmpty
      if (to === addr.token && selector === f.selectors.approve) {
        result = f.yes
        lastSimulation = "token"
      }
      if (to === addr.permit2 && selector === f.selectors.permitApprove) {
        result = "0x"
        lastSimulation = "router"
      }
      if (to === addr.router) {
        result = "0x"
        lastSimulation = "trade"
      }
    }
    if (method === "eth_getTransactionReceipt") {
      if (lastSimulation === "token") tokenApproved = true
      if (lastSimulation === "router") routerApproved = true
      result = {
        transactionHash: tx,
        transactionIndex: "0x0",
        blockHash: "0x" + "1".repeat(64),
        blockNumber: "0x18ebbbb",
        from: addr.creator,
        to: addr.router,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "0".repeat(512),
        status: "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      }
    }
    if (
      method === "eth_sendRawTransaction" ||
      method === "eth_sendTransaction"
    ) {
      writes++
      throw new Error("Unexpected real write")
    }
    if (result !== undefined)
      await route.fulfill({ json: { jsonrpc: "2.0", id: body.id, result } })
    else await route.continue()
  }
  await page.route(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    routeHandler,
  )
  await page.goto("http://127.0.0.1:4173/preview/")
  await page
    .getByText("✓ matches MANIFESTO_HASH on Ethereum")
    .waitFor({ timeout: 30000 })
  await page.evaluate((creator) => {
    window.__calls = []
    window.__reject = true
    window.__events = {}
    let chain = "0x89"
    let count = 0
    const provider = {
      request: async (request) => {
        window.__calls.push(request)
        if (
          request.method === "eth_requestAccounts" ||
          request.method === "eth_accounts"
        )
          return [creator]
        if (request.method === "eth_chainId") return chain
        if (request.method === "wallet_switchEthereumChain") {
          chain = "0x1"
          window.__events.chainChanged?.("0x1")
          return null
        }
        if (request.method === "eth_sendTransaction") {
          if (window.__reject) throw { code: 4001, message: "User rejected" }
          count++
          return "0x" + count.toString(16).padStart(64, "0")
        }
        if (request.method === "wallet_watchAsset") return true
        throw new Error("Unexpected mock wallet request " + request.method)
      },
      on: (event, callback) => {
        window.__events[event] = callback
      },
      removeListener: (event) => {
        delete window.__events[event]
      },
    }
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: { info: { uuid: "wallet-a", name: "Test Wallet A" }, provider },
      }),
    )
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { uuid: "wallet-b", name: "Test Wallet B" },
          provider: { ...provider },
        },
      }),
    )
  }, f.addr.creator)
  await page.locator(".wallet-button").click()
  check(
    (await page
      .getByRole("button", { name: "Test Wallet A", exact: false })
      .isVisible()) &&
      (await page
        .getByRole("button", { name: "Test Wallet B", exact: false })
        .isVisible()),
    "EIP-6963 lists both injected wallets",
  )
  await page
    .getByRole("button", { name: "Test Wallet A", exact: false })
    .click()
  await page.getByLabel("you pay").fill("0.001")
  await page.getByRole("button", { name: "Buy FREE1376", exact: false }).click()
  await page
    .getByText("Request declined in your wallet. You can try again.", {
      exact: true,
    })
    .first()
    .waitFor({ timeout: 15000 })
  const first = await page.evaluate(() => window.__calls)
  check(
    first.some(
      (c) =>
        c.method === "wallet_switchEthereumChain" &&
        c.params[0].chainId === "0x1",
    ),
    "Wrong network asks for chain 1",
  )
  const txs = first.filter((c) => c.method === "eth_sendTransaction")
  check(
    txs.length === 1 && txs[0].params[0].to.toLowerCase() === addr.router,
    "Buy issues one router transaction, no approvals",
  )
  check(
    txs[0].params[0].value === "0x38d7ea4c68000",
    "Buy sends exactly 0.001 ETH",
  )
  results.push("Wallet rejection is recoverable")
  await page.evaluate(() => {
    window.__reject = false
  })
  await page.getByRole("tab", { name: "Sell", exact: true }).click()
  await page
    .getByRole("button", { name: "Sell 50 percent of balance", exact: true })
    .click()
  check(
    (await page.getByLabel("you pay").inputValue()) === "500",
    "Sell percentage uses onchain balance",
  )
  await page
    .getByRole("button", { name: "Approve FREE1376 · 1 of 2", exact: false })
    .click()
  await page
    .getByRole("button", { name: "Approve router · 2 of 2", exact: false })
    .waitFor({ timeout: 15000 })
  await page
    .getByRole("button", { name: "Approve router · 2 of 2", exact: false })
    .click()
  await page
    .getByRole("button", { name: "Sell FREE1376", exact: false })
    .waitFor({ timeout: 15000 })
  check(
    (await page.locator(".approvals").innerText()).match(/ready · skipped/g)
      .length === 2,
    "Both completed approvals are marked skipped",
  )
  await page
    .getByRole("button", { name: "Sell FREE1376", exact: false })
    .click()
  await page
    .getByText("Sell confirmed on Ethereum.", { exact: true })
    .waitFor({ timeout: 15000 })
  const after = await page.evaluate(() =>
    window.__calls.filter((c) => c.method === "eth_sendTransaction"),
  )
  check(after.length === 4, "Sell required exactly two approvals and one trade")
  check(
    after[1].params[0].to.toLowerCase() === addr.token &&
      after[2].params[0].to.toLowerCase() === addr.permit2 &&
      after[3].params[0].to.toLowerCase() === addr.router,
    "Sell uses token → Permit2 → Universal Router path",
  )
  check(after[3].params[0].value === "0x0", "Sell sends zero ETH value")
  await page
    .getByRole("button", { name: "Add FREE1376 to wallet", exact: true })
    .click()
  check(
    await page.evaluate(() =>
      window.__calls.some(
        (c) =>
          c.method === "wallet_watchAsset" &&
          c.params.options.symbol === "FREE1376",
      ),
    ),
    "wallet_watchAsset uses correct token",
  )
  check(
    (await page.locator(".transaction a").getAttribute("href")).startsWith(
      "https://etherscan.io/tx/",
    ),
    "Trade exposes transaction link",
  )
  await page
    .getByRole("button", { name: "Sell FREE1376", exact: false })
    .click()
  await page
    .getByText("Sell confirmed on Ethereum.", { exact: true })
    .waitFor({ timeout: 15000 })
  check(
    (await page.evaluate(
      () =>
        window.__calls.filter((c) => c.method === "eth_sendTransaction").length,
    )) === 5,
    "Repeat sell skips both approvals",
  )
  check(writes === 0, "No real transaction was broadcast")
  await page.evaluate(() => window.__events.accountsChanged([]))
  await page
    .getByRole("button", { name: "Connect wallet to sell", exact: false })
    .waitFor()
  results.push("Account disconnect clears connected state")
  await page.unroute(
    /https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/,
    routeHandler,
  )
  return { results }
}
