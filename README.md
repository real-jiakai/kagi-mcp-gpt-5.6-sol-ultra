**English** | [简体中文](./README.zh-CN.md)

# Kagi Session MCP

A compact Node.js stdio MCP server that lets any compatible AI agent search
Kagi with the Session Link from your own paid account.

It exposes two read-only tools:

- `kagi_search` - ranked web results with title, URL, domain, snippet, optional
  date, related queries, pagination metadata, and a short in-memory cache.
- `kagi_list_lenses` - a discovery helper, not a search. It reads the
  signed-in account's Lens names, descriptions, stable numeric IDs, and active
  states so an agent can select a valid Lens without guessing.

It works with Claude Code, Codex, OpenClaw, Hermes Agent, and other
stdio-capable MCP clients.

> **Acknowledgement:** Development and documentation were assisted by
> GPT-5.6 Sol Ultra in Codex. The package name records that development
> context; it does not imply sponsorship, certification, or endorsement by
> OpenAI. This is an independent, unofficial project and is not affiliated
> with or endorsed by Kagi or OpenAI.

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

The server uses the stable TypeScript SDK v2 stdio entry point. A new client
can open with stateless `server/discover` negotiation for MCP `2026-07-28`,
while an older client can use the legacy initialize handshake against the
same executable. No client-specific configuration switch is required.

Streamable HTTP transport is intentionally not enabled. A network listener
would add authentication, authorization, TLS, deployment, and multi-user
credential-isolation concerns around a Session Link that grants broad access
to one personal Kagi session. That is outside this project's single-user
design. Use Kagi's official hosted MCP when you need a remotely reachable or
production-supported service.

## Requirements

- Node.js 24 LTS recommended; install the latest 24.x release
  ([24.18.0](https://nodejs.org/en/blog/release/v24.18.0) when this README was
  updated). The minimum supported version remains 20.18.1.
- A personal Kagi paid account
- A current Kagi Session Link from the Kagi Control Center

## Quick start

Get a Session Link from the Kagi Control Center, then set it in the environment
that starts your MCP client. The value may be either the raw token or the
complete Session Link.

PowerShell:

```powershell
$env:KAGI_SESSION_TOKEN = Read-Host "Paste the Kagi token or complete Session Link"
```

macOS, Linux, or WSL:

```bash
read -rsp "Paste the Kagi token or complete Session Link: " KAGI_SESSION_TOKEN
export KAGI_SESSION_TOKEN
printf '\n'
```

Choose one client recipe below. Every recipe lets the client run the package
through `npx`; no global installation is required. Never put the real
credential in a repository, command argument, or shared configuration file.

## Install in your MCP client

Every client launches the same local stdio command:

```text
npx -y kagi-mcp-gpt-5.6-sol-ultra
```

The client must pass `KAGI_SESSION_TOKEN` to that process. Prefer inheriting it
from the client process or resolving it from a local secret store instead of
writing the real value into a configuration file.

### Claude Code

Run this after setting `KAGI_SESSION_TOKEN` in the same shell:

```bash
claude mcp add --scope user --transport stdio kagi-session -- npx -y kagi-mcp-gpt-5.6-sol-ultra
claude mcp get kagi-session
```

Start Claude Code from that environment and use `/mcp` to verify the server.
User scope makes the tool available across projects. See the official
[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Codex

Add this to `~/.codex/config.toml` (on Windows, normally
`C:\Users\YOUR_USER\.codex\config.toml`):

```toml
[mcp_servers.kagi_session]
command = "npx"
args = ["-y", "kagi-mcp-gpt-5.6-sol-ultra"]
env_vars = ["KAGI_SESSION_TOKEN"]
```

`env_vars` forwards `KAGI_SESSION_TOKEN` from the local Codex process without
writing its value into `config.toml`. Start Codex from an environment that has
the variable set, then restart Codex after changing the configuration. In the
Codex TUI, use `/mcp` to confirm that the server initialized.

See the official
[Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp.md) for
the shared Codex MCP configuration format.

### OpenClaw

Set `KAGI_SESSION_TOKEN` in the environment that starts OpenClaw, then save a
stdio server definition without copying the secret into OpenClaw's config:

```bash
openclaw mcp set kagi-session '{"command":"npx","args":["-y","kagi-mcp-gpt-5.6-sol-ultra"],"env":{"KAGI_SESSION_TOKEN":"${KAGI_SESSION_TOKEN}"},"requestTimeoutMs":60000,"connectionTimeoutMs":30000,"toolFilter":{"include":["kagi_search","kagi_list_lenses"]}}'
openclaw mcp doctor kagi-session --probe
```

The `${KAGI_SESSION_TOKEN}` value is resolved from OpenClaw's process
environment at activation time. OpenClaw can also load it from its trusted
global environment file at `~/.openclaw/.env`. See the official
[OpenClaw MCP](https://docs.openclaw.ai/cli/mcp) and
[environment-variable](https://docs.openclaw.ai/help/environment)
documentation. On Windows, OpenClaw recommends
[WSL2](https://docs.openclaw.ai/windows) for the most compatible setup.

### Hermes Agent

Store the credential in Hermes Agent's private environment file:

```dotenv
# ~/.hermes/.env
KAGI_SESSION_TOKEN=your_token_or_complete_session_link
```

Then add the server to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  kagi:
    command: "npx"
    args: ["-y", "kagi-mcp-gpt-5.6-sol-ultra"]
    env:
      KAGI_SESSION_TOKEN: "${KAGI_SESSION_TOKEN}"
    enabled: true
    tools:
      include:
        - kagi_search
        - kagi_list_lenses
```

`~/.hermes/.env` is a local plaintext file, so restrict its permissions and
never commit or share it. Verify the server with `hermes mcp test kagi` and
`hermes mcp list`, then start `hermes chat`. If you edit the configuration
during a session, use `/reload-mcp`; Hermes exposes these tools with names such
as `mcp_kagi_kagi_search`. See the official
[Hermes Agent MCP guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/).

### Other MCP clients

For clients that use the common `mcpServers` JSON shape:

```json
{
  "mcpServers": {
    "kagi-session": {
      "command": "npx",
      "args": ["-y", "kagi-mcp-gpt-5.6-sol-ultra"],
      "env": {
        "KAGI_SESSION_TOKEN": "${KAGI_SESSION_TOKEN}"
      }
    }
  }
}
```

Environment-variable expansion differs between clients. If yours does not
support it, use its local secret store; do not place the real value in a
shared configuration.

## Tool reference

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

`kagi_list_lenses` is a discovery helper, not a search tool. It reads the
signed-in account's Lens settings and returns each Lens's name, description,
stable numeric ID, and active state. An agent should call it only when it
needs a Lens-filtered search, then pass an active ID to `kagi_search.lens`.

The Lens list is briefly cached and does not consume a search. If a requested
Lens is inactive or Kagi ignores it, `kagi_search` returns `filter_rejected`
instead of silently returning unfiltered results.

Typical workflow: `kagi_list_lenses` → choose an active numeric ID →
`kagi_search` with that ID in `lens`.

## Failure behavior

- `authentication` - renew the Session Link, update the environment, restart.
- `forbidden` - the session may be stale, or Kagi may reject the current IP.
- `filter_rejected` - activate the Lens in Kagi settings or select an active ID.
- `rate_limited` - wait for the reported interval before retrying.
- `parser_changed` - Kagi's page structure may have changed; upgrade the
  package or [report an issue](https://github.com/real-jiakai/kagi-mcp-gpt-5.6-sol-ultra/issues).
- `timeout` / `upstream` - a bounded network or Kagi service failure.

All agent-visible errors are sanitized. Raw response bodies and request
headers are never logged.
