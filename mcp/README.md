# Uydi Voice MCP

A local stdio server for the Uydi voice API. Search the voice catalog, check credit balance and pricing, generate speech, recover a pending request, and download a WAV.

## Install

Install Node.js 20 or later for command-line clients. In Codex, run:

```sh
codex mcp add uydi -- npx --yes https://uydi.com/downloads/uydi-voice-mcp-1.4.0.tgz
```

In Claude Code, run:

```sh
claude mcp add --transport stdio uydi -- npx --yes https://uydi.com/downloads/uydi-voice-mcp-1.4.0.tgz
```

In Cursor, add the following server to your MCP configuration:

```json
{
  "mcpServers": {
    "uydi": {
      "command": "npx",
      "args": ["--yes", "https://uydi.com/downloads/uydi-voice-mcp-1.4.0.tgz"]
    }
  }
}
```

For Claude Desktop, open the [Uydi Voice extension](https://github.com/lvyinchao/uydi-voice-skill/releases/download/v1.4.0/uydi-voice-1.4.0.mcpb) and choose Install. You can also run a source checkout with `npm ci` and configure your client to launch `node` with the absolute path to `server.mjs`.

## Sign in

With the [Uydi Skill](https://uydi.com/api-docs#install-skill) installed, run `node scripts/uydi.mjs login` from its folder. Approve the login in your browser. The connector reads the saved sign-in from the same computer.

Alternatively, create a [personal API token](https://uydi.com/app/api) with the scopes below and provide it through the local MCP host’s secret environment as `UYDI_API_TOKEN`, or in the desktop extension’s token setting. For Codex, if the token is already in the environment where you start Codex, add `env_vars = ["UYDI_API_TOKEN"]` to its `[mcp_servers.uydi]` table. The token takes precedence over a cached login. Keep credentials out of prompts and version control.

Restart the client and ask it to run `uydi_credits`. A successful connection returns your balance, plan and speech pricing. This check is free.

| Tools | Required scope | Effect |
| --- | --- | --- |
| `uydi_credits` | `account:read` | Read balance and pricing |
| `uydi_find_voices`, `uydi_my_voices` | `voices:read` | Search system voices or read the personal library |
| `uydi_synthesize`, `uydi_synthesis_status` | `synthesis:write` | Generate speech using account credits, or look up an existing operation for free |
| `uydi_history`, `uydi_download_wav` | `synthesis:read` | Read recent recordings or save a local WAV |

Save the synthesis idempotency key before starting a paid request. After a timeout or pending response, use the same key to look up the result. A new recording uses a new key. Pass a returned speech `audioUrl` to the download tool. It writes a new file in `~/Downloads/Uydi` and returns its full path.

Set `UYDI_OUTPUT_DIR` in the local host environment to choose another download folder. A development deployment can set `UYDI_BASE_URL` and `UYDI_CONFIG_DIR`. Signed-in credentials are tied to their original service. See the [Uydi API guide](https://uydi.com/api-docs#install-mcp) for client setup, permissions and API limits.
