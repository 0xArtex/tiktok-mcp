# TikTok MCP

Post, schedule, manage, and analyze TikTok accounts from any MCP-compatible AI agent.

- Connect accounts with secure QR login
- Post videos now or schedule them
- Follow users, like videos, and manage profiles
- Track analytics, growth, and content hooks
- No API keys or subscriptions

## Quick start

Run the MCP locally by adding it to your agent configuration:

```json
{
  "mcpServers": {
    "tiktok": {
      "command": "npx",
      "args": ["-y", "github:0xArtex/tiktok-mcp"]
    }
  }
}
```

Restart your agent, then ask:

```text
Connect my TikTok account.
```

Open the returned link and scan the QR code with the TikTok app. The account is then ready for your agent to use.

The MCP process runs on your machine and can read local media paths. TikTok actions use the hosted x402 API, so there is no API key to configure.

## Example prompts

```text
Post launch.mp4 with the caption "We finally shipped."

Schedule demo.mp4 for tomorrow at 6 PM.

Show which of my recent videos are still gaining views.

Analyze the strongest hooks from my fitness posts.

Update my bio to "Building useful things in public."
```

`tiktok_post` accepts a local `video_path`, and `tiktok_update_avatar` accepts a local `image_path`. Public media URLs work too.

## Tools

| Tool | What it does |
|---|---|
| `tiktok_connect` | Start a QR login |
| `tiktok_connect_status` | Check whether login completed |
| `tiktok_accounts` | List connected accounts and session health |
| `tiktok_post` | Post or schedule a video |
| `tiktok_operation_status` | Poll an asynchronous action |
| `tiktok_follow` | Follow a user |
| `tiktok_like` | Like a video |
| `tiktok_delete` | Delete a video |
| `tiktok_update_profile` | Update a display name or bio |
| `tiktok_update_avatar` | Update a profile image |
| `tiktok_analytics` | Fetch post performance metrics |
| `tiktok_series` | Read saved performance history and growth |
| `tiktok_hooks` | Analyze caption hooks for an account or niche |
| `tiktok_niches` | List available hook-analysis niches |
| `tiktok_scheduled` | List scheduled posts |
| `tiktok_cancel_scheduled` | Cancel a scheduled post |

## Hosted alternative

If you do not want to run an MCP process locally, use the hosted x402 API directly:

```bash
npx agentcash@latest add https://tiktok.palmyr.ai
npx agentcash@latest discover https://tiktok.palmyr.ai
```

Inspect an endpoint before calling it:

```bash
npx agentcash@latest check https://tiktok.palmyr.ai/v1/post
```

AgentCash handles the x402 payment automatically:

```bash
npx agentcash@latest fetch https://tiktok.palmyr.ai/v1/connect \
  -m POST \
  -b '{"account_id":"my-brand"}'
```

- [Agent skill](https://tiktok.palmyr.ai/skill.md)
- [OpenAPI](https://tiktok.palmyr.ai/openapi.json)
- [Agentic Market](https://agentic.market/services/tiktok-palmyr-ai)

## Configuration

| Setting | Default | Description |
|---|---|---|
| `TIKTOK_API_URL` | `https://tiktok.palmyr.ai` | Override the TikTok API origin |

## Development

```bash
git clone https://github.com/0xArtex/tiktok-mcp.git
cd tiktok-mcp
npm install
npm test
```

## License

MIT
