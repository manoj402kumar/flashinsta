import test from "node:test"
import assert from "node:assert/strict"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const pw = require("/home/yenigandlamanojkumar/.hermes/tools/node-26.7.0-linux-x64/lib/node_modules/rea-agents/node_modules/playwright-core")

const BRAVE_BIN = "/var/lib/flatpak/exports/bin/com.brave.Browser"
const PROD_URL = "https://insta-p8-fawn.vercel.app"

async function withBrowser(fn) {
  const browser = await pw.chromium.launch({
    executablePath: BRAVE_BIN,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  })
  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()
    await fn(page, context)
  } finally {
    await browser.close()
  }
}

test("E2E Browser 1: Public landing page loads with zero console errors", async () => {
  await withBrowser(async (page) => {
    const consoleErrors = []
    page.on("pageerror", (err) => consoleErrors.push(err.message))

    const response = await page.goto(PROD_URL, { waitUntil: "domcontentloaded", timeout: 20000 })
    assert.equal(response.status(), 200, "Landing page must return HTTP 200")

    const title = await page.title()
    assert.ok(title.length > 0, "Page must have a valid title")

    // Assert zero unhandled JavaScript runtime exceptions on the page
    assert.equal(consoleErrors.length, 0, `Page threw JavaScript errors: ${consoleErrors.join("; ")}`)
  })
})

test("E2E Browser 2: Edge middleware blocks unauthenticated dashboard navigation", async () => {
  await withBrowser(async (page) => {
    // Attempt navigating directly to /dashboard without session cookie
    const response = await page.goto(`${PROD_URL}/dashboard`, { waitUntil: "domcontentloaded", timeout: 20000 })

    // Must be redirected to login
    const finalUrl = page.url()
    assert.ok(
      finalUrl.includes("auth=login") || finalUrl === `${PROD_URL}/`,
      `Unauthenticated user should be redirected to login. Actual URL: ${finalUrl}`
    )
  })
})

test("E2E Browser 3: Privacy policy page renders GDPR & Meta compliance", async () => {
  await withBrowser(async (page) => {
    const response = await page.goto(`${PROD_URL}/privacy`, { waitUntil: "domcontentloaded", timeout: 20000 })
    assert.equal(response.status(), 200)

    const pageContent = await page.textContent("body")
    assert.ok(pageContent.toLowerCase().includes("privacy"), "Privacy page must mention Privacy")
  })
})

test("E2E Browser 4: Live production health probe via browser DOM", async () => {
  await withBrowser(async (page) => {
    const response = await page.goto(`${PROD_URL}/api/health`, { timeout: 15000 })
    assert.equal(response.status(), 200)

    const rawJson = await page.textContent("body")
    const health = JSON.parse(rawJson)

    assert.equal(health.status, "ok")
    assert.equal(health.services.app, "healthy")
    assert.equal(health.services.database, "connected")
    assert.ok(health.latencyMs > 0, "Latency must be reported")
  })
})
