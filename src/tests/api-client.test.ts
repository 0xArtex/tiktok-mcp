import assert from "node:assert/strict";
import { test } from "node:test";
import { buildToolResult, queryString, type ApiResponse } from "../api-client.js";

function response(overrides: Partial<ApiResponse>): ApiResponse {
  return {
    status: 200,
    text: "{}",
    json: {},
    headers: {},
    ...overrides,
  };
}

test("maps an unpaid 402 to an MCP x402 challenge", () => {
  const challenge = {
    x402Version: 2,
    resource: { url: "https://example.test/v1/post" },
    accepts: [{ network: "eip155:8453", amount: "10000" }],
  };
  const result = buildToolResult(
    response({ status: 402, text: JSON.stringify(challenge), json: challenge }),
    "tiktok_post",
  );

  assert.equal(result.isError, true);
  assert.deepEqual(result.structuredContent, { ...challenge, error: "Payment required" });
  assert.deepEqual(result._meta?.["x402/error"], result.structuredContent);
});

test("preserves a settlement receipt on success", () => {
  const receipt = { success: true, transaction: "0xabc", network: "eip155:8453" };
  const encoded = Buffer.from(JSON.stringify(receipt)).toString("base64");
  const result = buildToolResult(
    response({ text: '{"ok":true}', headers: { "payment-response": encoded } }),
    "tiktok_like",
  );

  assert.equal(result.isError, undefined);
  assert.deepEqual(result._meta?.["x402/payment-response"], receipt);
});

test("never turns a settled 402 into a second payment challenge", () => {
  const receipt = { success: true, transaction: "0xdef" };
  const encoded = Buffer.from(JSON.stringify(receipt)).toString("base64");
  const result = buildToolResult(
    response({
      status: 402,
      text: '{"operation_id":"op_1"}',
      headers: { "payment-response": encoded },
    }),
    "tiktok_post",
  );

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent, undefined);
  assert.equal(result._meta?.["x402/error"], undefined);
});

test("queryString omits absent values and encodes values", () => {
  assert.equal(
    queryString({ account_id: "brand one", include_done: false, empty: "", missing: undefined }),
    "?account_id=brand+one&include_done=false",
  );
});
