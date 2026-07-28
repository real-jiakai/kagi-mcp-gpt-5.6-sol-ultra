[English](./README.md) | [简体中文](./README.zh-CN.md)

# Kagi Session MCP

A compact, local-only MCP server that lets an AI agent search Kagi with the
Session Link from your own paid account.

It exposes two read-only tools:

- `kagi_search` - ranked web results with title, URL, domain, snippet, optional
  date, related queries, pagination metadata, and a short in-memory cache.
- `kagi_list_lenses` - active and inactive account Lenses with the numeric IDs
  required by Kagi's current HTML search frontend.

## Important status

This project is **unofficial and experimental**. Kagi documents Session Links
as browser-login credentials, not as a machine API. The server reads Kagi's
HTML frontend, so a frontend change can require a parser update.

Kagi also operates an
[official hosted MCP server](https://github.com/kagisearch/kagimcp) backed by
its separately billed API. Use the official server when you need a supported,
stable, production integration or page extraction.

Use this Session-based server only for your own local, personal account. A
Session Link grants broad access to that Kagi session:

- never paste it into chat;
- never commit it to a repository;
- never share the MCP server over a network;
- sign out of the source Kagi session to revoke it;
- change your Kagi password to invalidate all sessions.

See Kagi's
[Private Browser Session Link documentation](https://help.kagi.com/kagi/privacy/private-browser-sessions.html).

## Why the credential is not placed in a URL

Kagi's official browser extension authenticates Kagi requests with:

```http
X-Kagi-Authorization: <session token>
```

This server follows that same pattern. The token is read once from the local
process environment, sent only to the exact `https://kagi.com` origin, and
never included in search URLs, tool arguments, results, or error messages.

## Transport and network model

`kagi-mcp-gpt-5.6-sol-ultra` is a Node.js **stdio MCP server**. An MCP client
such as Codex starts it as a local child process and exchanges MCP JSON-RPC
messages over standard input and standard output. The process does not listen
on a TCP port, bind to a network interface, or expose an inbound HTTP endpoint.

The server still makes outbound HTTPS requests to the exact
`https://kagi.com` origin to perform searches. "Local-only" describes the MCP
transport and credential boundary; it does not mean that Kagi searches work
offline.

Streamable HTTP transport is intentionally not enabled. A network listener
would add authentication, authorization, TLS, deployment, and multi-user
credential-isolation concerns around a Session Link that grants broad access
to one personal Kagi session. That is outside this project's single-user
design. Use Kagi's official hosted MCP when you need a remotely reachable or
production-supported service.

## Requirements

- Node.js 20.18.1 or newer
- A personal Kagi paid account
- A current Kagi Session Link from the Kagi Control Center

## Configure the secret

Set the credential in the same environment that launches your MCP client. The
value may be either the raw token or the complete Session Link.

This PowerShell form avoids putting the secret directly in the command line:

```powershell
$env:KAGI_SESSION_TOKEN = Read-Host "Paste the Kagi token or complete Session Link"
```

Do not put the real value in `.env.example`. This project does not load `.env`
files automatically, which avoids silently copying a full account credential
into the project.

## Run from npm

No global installation is required. After setting the credential, run the
public npm package with:

```powershell
npx -y kagi-mcp-gpt-5.6-sol-ultra
```

To install the command globally instead:

```powershell
npm install --global kagi-mcp-gpt-5.6-sol-ultra
kagi-mcp-gpt-5.6-sol-ultra
```

When started directly, the command waits for MCP messages on stdin; an idle
terminal is expected. In normal use, let Codex or another MCP client start it.

## Codex configuration with npx

Codex supports local stdio MCP servers through `command` and `args`. Add this
to `~/.codex/config.toml` (on Windows, normally
`C:\Users\YOUR_USER\.codex\config.toml`):

```toml
[mcp_servers.kagi_session]
command = "npx"
args = ["-y", "kagi-mcp-gpt-5.6-sol-ultra"]
env_vars = ["KAGI_SESSION_TOKEN"]
startup_timeout_sec = 30
tool_timeout_sec = 60
enabled = true
required = false
default_tools_approval_mode = "auto"
```

`env_vars` forwards `KAGI_SESSION_TOKEN` from the local Codex process without
writing its value into `config.toml`. Start Codex from an environment that has
the variable set, then restart Codex after changing the configuration. In the
Codex TUI, use `/mcp` to confirm that the server initialized.

If Windows cannot find `npx`, replace `command = "npx"` with the absolute path
to your `npx.cmd`, for example:

```toml
command = "C:\\Users\\YOUR_USER\\.codex\\tools\\node\\npx.cmd"
```

See the official
[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp.md) for
the shared Codex MCP configuration format.

## Other MCP clients

For clients that use JSON configuration, launch the public npm package with
`npx`:

```json
{
  "mcpServers": {
    "kagi-session": {
      "command": "npx",
      "args": [
        "-y",
        "kagi-mcp-gpt-5.6-sol-ultra"
      ],
      "env": {
        "KAGI_SESSION_TOKEN": "PASTE_LOCALLY_OR_INHERIT_FROM_YOUR_SECRET_STORE"
      }
    }
  }
}
```

Many desktop MCP clients store the `env` object as plain text. Prefer an
inherited environment variable or your client's secret store when available.
Never send that configuration file to anyone.

## Local source checkout and Windows DPAPI development

Use a source checkout when developing, running the test suite, or using the
included Windows DPAPI launcher:

```powershell
git clone https://github.com/real-jiakai/kagi-mcp-gpt-5.6-sol-ultra.git
cd kagi-mcp-gpt-5.6-sol-ultra
npm install
npm run check
```

Build output is written to `dist`.

### DPAPI credential launcher

For a persistent local Codex development installation, store the credential
encrypted for the current Windows user:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\store-session-token.ps1
```

Then add this to `C:\Users\YOUR_USER\.codex\config.toml`, replacing the
checkout path with its absolute location:

```toml
[mcp_servers.kagi_session]
command = "C:\\Users\\YOUR_USER\\.codex\\tools\\node\\node.exe"
args = ["C:\\path\\to\\kagi-mcp-gpt-5.6-sol-ultra\\scripts\\run-with-session-token.mjs"]
cwd = "C:\\path\\to\\kagi-mcp-gpt-5.6-sol-ultra"
startup_timeout_sec = 15
tool_timeout_sec = 60
enabled = true
required = false
default_tools_approval_mode = "auto"
```

The encrypted value is stored under
`%APPDATA%\kagi-session-mcp\session-token.dpapi`. The launcher decrypts it
only in memory, starts the locally built MCP server, and forwards MCP stdio
directly. This launcher belongs to the source checkout; the npm/npx setup above
uses the inherited environment variable instead. Restart Codex after changing
`config.toml`.

To test the exact installed launcher without exposing the credential:

```powershell
npm run build
npm run smoke:installed
```

To exercise installed-MCP pagination through the same DPAPI-backed launcher,
deduplicate exact result URLs, and print one aggregate JSON object:

```powershell
npm run build
npm run smoke:installed:all
```

This searches `KAGI_SMOKE_QUERY` (default: `gemini 3.5 pro`) with 20 results
per page until Kagi reports no more pages or 10 pages have been fetched. Its
single JSON response includes per-page metadata, globally numbered unique
results, and an exact count of duplicate URLs removed across pages.

## Optional live smoke test

The automated test suite never uses a real account. From a source checkout,
perform one intentional live search after setting the environment variable:

```powershell
npm run build
npm run smoke
```

You can choose the test query without placing the credential on the command
line:

```powershell
$env:KAGI_SMOKE_QUERY = "Model Context Protocol"
npm run smoke
```

## Agent-facing contract

`kagi_search` accepts:

| Field | Default | Purpose |
| --- | ---: | --- |
| `query` | required | Search text; Kagi operators such as `site:` are allowed |
| `limit` | `20` | Return 1-20 organic results; the default matches one full lightweight Kagi result page |
| `page` | `1` | Page 1-10; paginate only when needed |
| `time_range` | `any` | `any`, `day`, `week`, `month`, or `year` |
| `sort` | `relevance` | `relevance`, `recency`, `website`, or `ad_trackers` |
| `region` | `no_region` | Lowercase Kagi region such as `us`, `gb`, `cn`, `jp`, or `no_region`; locale variants such as `ca_fr` are accepted |
| `lens` | none | A known Lens name or a numeric active Lens ID from `kagi_list_lenses` |
| `verbatim` | `false` | Request a more literal query match |

The response includes a Markdown text fallback and structured MCP content.
Its `filters` object records the resolved numeric Lens ID and other applied
parameters. `contentScope` is `kagi_search_snippets`: each `snippet` comes from
Kagi's search-result page. The MCP does not fetch or parse the destination
pages, and it does not invoke Kagi's separate Summarize feature. Search result
text is untrusted web content, not instructions. `pageResultCount` reports how
many organic cards Kagi returned on the current lightweight page; `truncated`
is true only when the requested `limit` locally hides some of those cards.

### Lens selection

For common built-in Lenses, the agent can pass one of these names directly:

| Name | Current Lens ID |
| --- | ---: |
| `forums` | `1` |
| `academic` | `2` |
| `pdfs` | `3` |
| `programming` | `15` |
| `news_360` | `29` |
| `small_web` | `107` |
| `recipes` | `120` |
| `fediverse_forums` | `4248` |
| `kagi_documentation` | `3271` |
| `usenet_archive` | `5648` |
| `cyber_security` | `4583` |
| `jobs` | `19487` |

An account can disable built-ins or add custom Lenses. For deterministic agent
behavior, call `kagi_list_lenses` and pass the returned numeric ID. The list
comes from `/html/settings/lenses`, is cached briefly, and does not consume a
search. If a requested Lens is inactive or Kagi ignores it, `kagi_search`
fails closed with `filter_rejected` instead of silently returning unfiltered
results.

### Browser-verified URL mapping

The current Kagi UI was exercised in a signed-in Chrome session:

- selected Lens: `lens=<stable numeric Lens ID>`;
- selected country/region: `r=<code>`;
- no Lens: omit `lens` rather than using the stateful "last used Lens" toggle;
- ordinary result page 2: `batch=2`;
- Lens result page 2: `page=2`.

The MCP deliberately does not use the older `l=<menu position>` parameter.
Menu positions change when the account reorders Lenses; the IDs shown on
Kagi's Lens settings page are stable. The official Kagi Search API is a
different protocol (`lens_id` in JSON) and should not be mixed with this
session-backed HTML endpoint.

## Runtime controls

| Environment variable | Default | Allowed |
| --- | ---: | ---: |
| `KAGI_TIMEOUT_MS` | `15000` | `1000`-`30000` |
| `KAGI_CACHE_TTL_MS` | `60000` | `0`-`600000` |
| `KAGI_MAX_CONCURRENCY` | `2` | `1`-`4` |

The cache is memory-only and disappears when the MCP process exits. Automatic
HTTP retries are intentionally disabled so one agent call cannot silently
consume multiple searches.

## Failure behavior

- `authentication` - renew the Session Link, update the environment, restart.
- `forbidden` - the session may be stale, or Kagi may reject the current IP.
- `filter_rejected` - activate the Lens in Kagi settings or select an active ID.
- `rate_limited` - wait for the reported interval before retrying.
- `parser_changed` - Kagi returned valid HTML that no longer matches the
  observed result structure; update the fixture and parser before trusting it.
- `timeout` / `upstream` - a bounded network or Kagi service failure.

All agent-visible errors are sanitized. Raw response bodies and request
headers are never logged.

## Development

```powershell
npm test
npm run typecheck
npm run build
```

The tests cover Session Link normalization, deceptive-host rejection, search
and Lens-settings parsing, stable Lens-ID resolution, Lens versus ordinary
pagination, region variants, token non-disclosure, auth redirects, rate
limits, filter rejection, and cache reuse. Live-account tests are opt-in only.
