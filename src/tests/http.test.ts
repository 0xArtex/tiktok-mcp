import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { createHttpApp } from "../http.js";

async function mcpPost(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200);
  return response.json();
}

test("hosted transport initializes and exposes only TikTok tools", async () => {
  const listener = createHttpApp("https://example.test").listen(0);
  await once(listener, "listening");
  const { port } = listener.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/mcp`;

  try {
    const initialized = await mcpPost(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    assert.equal(initialized.result.serverInfo.name, "ai.palmyr/tiktok");

    const listed = await mcpPost(url, {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const names = listed.result.tools.map((tool: { name: string }) => tool.name);
    assert.equal(names.length, 16);
    assert.deepEqual(names.slice(0, 4), [
      "tiktok_connect",
      "tiktok_connect_status",
      "tiktok_accounts",
      "tiktok_post",
    ]);
    assert.ok(names.every((name: string) => name.startsWith("tiktok_")));
  } finally {
    await new Promise<void>((resolve, reject) => {
      listener.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test("tools call the canonical TikTok v1 API", async () => {
  let requestedPath = "";
  // Use a tiny API double instead of the MCP app for the upstream action API.
  const upstream = (await import("express")).default();
  upstream.get("/v1/niches", (req, res) => {
    requestedPath = req.path;
    res.json({ niches: [] });
  });
  const upstreamListener = upstream.listen(0);
  await once(upstreamListener, "listening");
  const upstreamPort = (upstreamListener.address() as AddressInfo).port;

  const listener = createHttpApp(`http://127.0.0.1:${upstreamPort}`).listen(0);
  await once(listener, "listening");
  const { port } = listener.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/mcp`;

  try {
    const called = await mcpPost(url, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "tiktok_niches", arguments: {} },
    });
    assert.equal(called.result.isError, undefined);
    assert.equal(requestedPath, "/v1/niches");
  } finally {
    await Promise.all([
      new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve())),
      new Promise<void>((resolve, reject) => upstreamListener.close((error) => error ? reject(error) : resolve())),
    ]);
  }
});
