import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TikTokApiClient, queryString, type ToolResult } from "./api-client.js";
import { prepareImageInput, prepareVideoInput } from "./media.js";

type Shape = Record<string, z.ZodTypeAny>;
type ToolExtra = { _meta?: Record<string, unknown> };

const PAYMENT = z
  .string()
  .optional()
  .describe("Base64 x402 payment payload. Omit on the first call to receive a payment challenge.");

const ACCOUNT_ID = z.string().min(1).max(64).describe("TikTok account ID used when connecting the account");

function textError(error: unknown): ToolResult {
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

function addTool(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: Shape },
  handler: (args: Record<string, any>, extra: ToolExtra) => Promise<ToolResult>,
): void {
  (server.registerTool as any)(
    name,
    config,
    async (args: Record<string, any>, extra: ToolExtra) => {
      try {
        return await handler(args, extra);
      } catch (error) {
        return textError(error);
      }
    },
  );
}

function paymentFrom(args: Record<string, any>): { payment?: string; body: Record<string, any> } {
  const { payment, ...body } = args;
  return { payment, body };
}

export type TikTokServerOptions = {
  apiUrl?: string;
  allowLocalFiles?: boolean;
};

export function createTikTokServer(options: TikTokServerOptions = {}): McpServer {
  const client = new TikTokApiClient(options.apiUrl);
  const allowLocalFiles = options.allowLocalFiles ?? false;
  const server = new McpServer(
    { name: "ai.palmyr/tiktok", title: "TikTok MCP", version: "0.2.0" },
    {
      instructions:
        "Connect a TikTok account first, then use its account_id for posting, scheduling, engagement, profile updates, and analytics. Paid hosted actions return an x402 challenge when called without payment.",
    },
  );

  const call = (
    method: "GET" | "POST",
    path: string,
    body: unknown,
    payment: string | undefined,
    extra: ToolExtra,
    toolName: string,
  ) =>
    client.call({
      method,
      path,
      body,
      payment,
      metaPayment: extra?._meta?.["x402/payment"],
      toolName,
    });

  addTool(
    server,
    "tiktok_connect",
    {
      title: "Connect a TikTok account",
      description:
        "Start a secure QR login. Give the returned connect_url to the account owner, then poll tiktok_connect_status.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        country: z.string().length(2).optional().describe("Optional ISO-2 country code"),
        tag: z.string().max(64).optional().describe("Optional label for grouping accounts"),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call("POST", "/v1/connect", body, payment, extra, "tiktok_connect");
    },
  );

  addTool(
    server,
    "tiktok_connect_status",
    {
      title: "Check TikTok connection",
      description: "Check whether a QR login has completed.",
      inputSchema: {
        token: z.string().min(1).describe("Token returned by tiktok_connect"),
      },
    },
    async ({ token }, extra) =>
      call(
        "GET",
        `/v1/connect/${encodeURIComponent(token)}`,
        undefined,
        undefined,
        extra,
        "tiktok_connect_status",
      ),
  );

  addTool(
    server,
    "tiktok_accounts",
    {
      title: "List TikTok accounts",
      description: "List connected accounts and their current session health.",
      inputSchema: {
        tag: z.string().optional(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call(
        "GET",
        `/v1/accounts${queryString({ tag: body.tag })}`,
        undefined,
        payment,
        extra,
        "tiktok_accounts",
      );
    },
  );

  const postInput: Shape = {
    account_id: ACCOUNT_ID,
    caption: z.string().max(2200),
    video_url: z.string().url().optional().describe("Public URL of the video"),
    video_base64: z.string().optional().describe("Base64-encoded video"),
    ...(allowLocalFiles
      ? { video_path: z.string().optional().describe("Local video path; available in stdio mode") }
      : {}),
    privacy: z.number().int().min(0).max(2).optional().describe("0 public, 1 friends, 2 private"),
    allow_comments: z.boolean().optional(),
    allow_duet: z.boolean().optional(),
    allow_stitch: z.boolean().optional(),
    schedule_at: z
      .string()
      .optional()
      .describe("ISO-8601 publish time, approximately 15 minutes to 10 days ahead"),
    payment: PAYMENT,
  };

  addTool(
    server,
    "tiktok_post",
    {
      title: "Post or schedule a TikTok video",
      description:
        "Publish a video immediately or schedule it with TikTok's native scheduler. Returns an operation to poll.",
      inputSchema: postInput,
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      const prepared = await prepareVideoInput(body);
      return call("POST", "/v1/post", prepared, payment, extra, "tiktok_post");
    },
  );

  addTool(
    server,
    "tiktok_operation_status",
    {
      title: "Check TikTok operation",
      description: "Poll a posting, engagement, profile, analytics, or cancellation operation.",
      inputSchema: {
        operation_id: z.string().min(1),
      },
    },
    async ({ operation_id }, extra) =>
      call(
        "GET",
        `/v1/operations/${encodeURIComponent(operation_id)}`,
        undefined,
        undefined,
        extra,
        "tiktok_operation_status",
      ),
  );

  addTool(
    server,
    "tiktok_follow",
    {
      title: "Follow a TikTok user",
      description: "Follow a user from a connected account. Returns an operation to poll.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        target_user: z.string().min(1).describe("TikTok handle, with or without @"),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call("POST", "/v1/follow", body, payment, extra, "tiktok_follow");
    },
  );

  addTool(
    server,
    "tiktok_like",
    {
      title: "Like a TikTok video",
      description: "Like a video from a connected account. Returns an operation to poll.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        video_url: z.string().url(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call("POST", "/v1/like", body, payment, extra, "tiktok_like");
    },
  );

  addTool(
    server,
    "tiktok_delete",
    {
      title: "Delete a TikTok video",
      description: "Delete a video from a connected account. Returns an operation to poll.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        video_url: z.string().url(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call("POST", "/v1/delete", body, payment, extra, "tiktok_delete");
    },
  );

  addTool(
    server,
    "tiktok_update_profile",
    {
      title: "Update a TikTok profile",
      description: "Update the display name, bio, or both. Returns an operation to poll.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        display_name: z.string().max(30).optional(),
        bio: z.string().max(80).optional(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      if (body.display_name === undefined && body.bio === undefined) {
        throw new Error("Pass display_name, bio, or both");
      }
      return call(
        "POST",
        "/v1/profile",
        body,
        payment,
        extra,
        "tiktok_update_profile",
      );
    },
  );

  const avatarInput: Shape = {
    account_id: ACCOUNT_ID,
    image_url: z.string().url().optional(),
    image_base64: z.string().optional(),
    ...(allowLocalFiles
      ? { image_path: z.string().optional().describe("Local image path; available in stdio mode") }
      : {}),
    payment: PAYMENT,
  };

  addTool(
    server,
    "tiktok_update_avatar",
    {
      title: "Update a TikTok avatar",
      description: "Set the profile image for a connected account. Returns an operation to poll.",
      inputSchema: avatarInput,
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      const prepared = await prepareImageInput(body);
      return call(
        "POST",
        "/v1/avatar",
        prepared,
        payment,
        extra,
        "tiktok_update_avatar",
      );
    },
  );

  addTool(
    server,
    "tiktok_analytics",
    {
      title: "Fetch TikTok analytics",
      description: "Fetch per-post views, likes, comments, and shares and save a time-series sample.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call("POST", "/v1/analytics", body, payment, extra, "tiktok_analytics");
    },
  );

  addTool(
    server,
    "tiktok_series",
    {
      title: "Read TikTok performance history",
      description: "Read saved analytics samples or calculate growth over a time window.",
      inputSchema: {
        account_id: ACCOUNT_ID,
        video_id: z.string().optional(),
        hours: z.number().positive().optional(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call(
        "GET",
        `/v1/series${queryString(body)}`,
        undefined,
        payment,
        extra,
        "tiktok_series",
      );
    },
  );

  addTool(
    server,
    "tiktok_hooks",
    {
      title: "Analyze TikTok hooks",
      description:
        "Find caption openings associated with stronger views for an account, account tag, or TikTok niche.",
      inputSchema: {
        account_id: z.string().optional(),
        tag: z.string().optional(),
        niche: z.string().optional(),
        caption: z.string().optional().describe("Optional draft caption to evaluate"),
        maturity_days: z.number().positive().optional(),
        recency_days: z.number().positive().optional(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call(
        "GET",
        `/v1/hooks${queryString(body)}`,
        undefined,
        payment,
        extra,
        "tiktok_hooks",
      );
    },
  );

  addTool(
    server,
    "tiktok_niches",
    {
      title: "List TikTok niches",
      description: "List the niches available to tiktok_hooks.",
      inputSchema: {},
    },
    async (_args, extra) =>
      call("GET", "/v1/niches", undefined, undefined, extra, "tiktok_niches"),
  );

  addTool(
    server,
    "tiktok_scheduled",
    {
      title: "List scheduled TikTok posts",
      description: "List pending and completed posts created through tiktok_post.",
      inputSchema: {
        account_id: z.string().optional(),
        include_done: z.boolean().optional(),
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      return call(
        "GET",
        `/v1/scheduled${queryString(body)}`,
        undefined,
        payment,
        extra,
        "tiktok_scheduled",
      );
    },
  );

  addTool(
    server,
    "tiktok_cancel_scheduled",
    {
      title: "Cancel a scheduled TikTok post",
      description: "Cancel a scheduled post by deleting its held TikTok video. Returns an operation to poll.",
      inputSchema: {
        operation_id: z.string().min(1),
        account_id: ACCOUNT_ID,
        payment: PAYMENT,
      },
    },
    async (args, extra) => {
      const { payment, body } = paymentFrom(args);
      const { operation_id, ...requestBody } = body;
      return call(
        "POST",
        `/v1/scheduled/${encodeURIComponent(operation_id)}/cancel`,
        requestBody,
        payment,
        extra,
        "tiktok_cancel_scheduled",
      );
    },
  );

  return server;
}
