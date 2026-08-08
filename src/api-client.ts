export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
};

export type ApiResponse = {
  status: number;
  text: string;
  json: unknown;
  headers: Record<string, string>;
};

const DEFAULT_API_URL = "https://tiktok.palmyr.ai";

export function apiBaseUrl(value = process.env.TIKTOK_API_URL || DEFAULT_API_URL): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("TIKTOK_API_URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function decodeBase64Json(value: string | undefined): unknown | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    return undefined;
  }
}

export function buildToolResult(response: ApiResponse, toolName: string): ToolResult {
  const receipt = decodeBase64Json(response.headers["payment-response"]);

  if (receipt) {
    return {
      ...(response.status >= 400 && response.status !== 402 ? { isError: true } : {}),
      content: [{ type: "text", text: response.text }],
      _meta: { "x402/payment-response": receipt },
    };
  }

  if (response.status === 402) {
    const body = response.json as Record<string, unknown> | undefined;
    const challenge = {
      x402Version: body?.x402Version ?? 2,
      error: body?.error ?? body?.message ?? "Payment required",
      resource: body?.resource ?? {
        url: `mcp://tool/${toolName}`,
        mimeType: "application/json",
      },
      accepts: body?.accepts ?? [],
    };
    return {
      isError: true,
      structuredContent: challenge,
      content: [{ type: "text", text: JSON.stringify(challenge) }],
      _meta: { "x402/error": challenge },
    };
  }

  if (response.status >= 200 && response.status < 300) {
    return { content: [{ type: "text", text: response.text }] };
  }

  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: true,
          status: response.status,
          body: response.json ?? response.text,
        }),
      },
    ],
  };
}

export class TikTokApiClient {
  readonly baseUrl: string;

  constructor(baseUrl = apiBaseUrl()) {
    this.baseUrl = apiBaseUrl(baseUrl);
  }

  async call(options: {
    method: "GET" | "POST";
    path: string;
    body?: unknown;
    payment?: string;
    metaPayment?: unknown;
    toolName: string;
  }): Promise<ToolResult> {
    const hasBody = options.method !== "GET";
    const headers: Record<string, string> = {};
    if (hasBody) headers["content-type"] = "application/json";

    const payment =
      options.payment ??
      (options.metaPayment
        ? Buffer.from(JSON.stringify(options.metaPayment)).toString("base64")
        : undefined);
    if (payment) headers["x-payment"] = payment;

    try {
      const response = await fetch(`${this.baseUrl}${options.path}`, {
        method: options.method,
        headers,
        body: hasBody ? JSON.stringify(options.body ?? {}) : undefined,
      });
      const text = await response.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key.toLowerCase()] = value;
      });
      return buildToolResult(
        { status: response.status, text, json, headers: responseHeaders },
        options.toolName,
      );
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: true,
              message: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
      };
    }
  }
}

export function queryString(values: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}
