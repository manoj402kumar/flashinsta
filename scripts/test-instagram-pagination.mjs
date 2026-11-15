import test from "node:test"
import assert from "node:assert/strict"

import { fetchAllPages } from "../lib/instagram-pagination.ts"

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

test("follows every page until Meta stops returning a next cursor", async () => {
  const pages = {
    "https://graph.test/media?page=1": {
      data: [{ id: "1" }, { id: "2" }],
      paging: { next: "https://graph.test/media?page=2" },
    },
    "https://graph.test/media?page=2": {
      data: [{ id: "2" }, { id: "3" }],
      paging: { next: "https://graph.test/media?page=3" },
    },
    "https://graph.test/media?page=3": {
      data: [{ id: "4" }],
      paging: { cursors: { after: "end" } },
    },
  }
  const requested = []

  const result = await fetchAllPages("https://graph.test/media?page=1", {
    fetchImpl: async (url) => {
      requested.push(url)
      return jsonResponse(pages[url])
    },
  })

  assert.deepEqual(result.items.map((item) => item.id), ["1", "2", "3", "4"])
  assert.equal(result.complete, true)
  assert.equal(result.pages, 3)
  assert.equal(result.error, null)
  assert.equal(requested.length, 3)
})

test("returns the pages already fetched when a later page fails", async () => {
  let call = 0
  const result = await fetchAllPages("https://graph.test/media?page=1", {
    fetchImpl: async () => {
      call += 1
      if (call === 1) {
        return jsonResponse({
          data: [{ id: "1" }],
          paging: { next: "https://graph.test/media?page=2" },
        })
      }
      return jsonResponse({ error: "rate limited" }, 429)
    },
  })

  assert.deepEqual(result.items.map((item) => item.id), ["1"])
  assert.equal(result.complete, false)
  assert.equal(result.pages, 1)
  assert.equal(result.error, "HTTP 429")
})

test("stops when Meta repeats a next cursor", async () => {
  const result = await fetchAllPages("https://graph.test/media?page=1", {
    fetchImpl: async () =>
      jsonResponse({
        data: [{ id: "1" }],
        paging: { next: "https://graph.test/media?page=1" },
      }),
  })

  assert.equal(result.complete, false)
  assert.equal(result.pages, 1)
  assert.equal(result.error, "paging loop detected")
})
