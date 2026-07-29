[English](./README.md) | **简体中文**

# Kagi Session MCP

一个紧凑的 Node.js stdio MCP 服务器，让任何兼容的 AI 智能体都可以通过你自己的
Kagi 付费账户 Session Link 搜索 Kagi。

它提供两个只读工具：

- `kagi_search` —— 返回带排名的网页结果，包括标题、URL、域名、摘要、
  可选日期、相关查询、分页元数据，以及一个短时内存缓存。
- `kagi_list_lenses` —— Lens 发现工具，不执行搜索。它读取当前登录账户中
  Lens 的名称、说明、稳定数字 ID 和启用状态，让智能体无需猜测即可选择有效 Lens。

它可与 Claude Code、Codex、OpenClaw、Hermes Agent 以及其他支持 stdio 的
MCP 客户端配合使用。

> **致谢：** 本项目的开发与文档编写使用了 Codex 中的 GPT-5.6 Sol Ultra
> 辅助。包名仅用于记录这一开发背景，不代表 OpenAI 对本项目的赞助、认证或背书。
> 本项目是独立的非官方项目，与 Kagi 或 OpenAI 无隶属关系，也未获得其官方背书。

## 重要说明

本项目是**非官方实验性项目**。Kagi 将 Session Link 作为浏览器登录凭据
提供，而不是机器 API。服务器读取 Kagi 的 HTML 前端，因此前端发生变化时，
可能需要更新解析器。

Kagi 也提供由单独计费 API 支持的
[官方托管 MCP 服务器](https://github.com/kagisearch/kagimcp)。如果你需要
受支持、稳定的生产集成或页面内容提取，请使用官方服务器。

这个基于 Session 的服务器只应在本地用于你自己的个人账户。Session Link
可广泛访问对应的 Kagi 会话：

- 不要把它粘贴到聊天中；
- 不要把它提交到代码仓库；
- 不要通过网络共享 MCP 服务器；
- 在生成该链接的 Kagi 会话中退出登录，即可撤销它；
- 修改 Kagi 密码可使所有会话失效。

请参阅 Kagi 的
[私密浏览器 Session Link 文档](https://help.kagi.com/kagi/privacy/private-browser-sessions.html)。

## 为什么凭据不放在 URL 中

Kagi 官方浏览器扩展使用以下请求头认证 Kagi 请求：

```http
X-Kagi-Authorization: <session token>
```

本服务器采用相同方式。令牌只从本地进程环境读取一次，仅发送到精确的
`https://kagi.com` 源，并且绝不会出现在搜索 URL、工具参数、结果或错误
消息中。

## 传输与网络模型

`kagi-mcp-gpt-5.6-sol-ultra` 是一个 Node.js **stdio MCP 服务器**。
Codex 等 MCP 客户端会把它作为本地子进程启动，并通过标准输入和标准输出
交换 MCP JSON-RPC 消息。该进程不会监听 TCP 端口、绑定网络接口，也不会
公开入站 HTTP 端点。

服务器仍会向精确的 `https://kagi.com` 源发出出站 HTTPS 请求以执行搜索。
“仅限本地”描述的是 MCP 传输方式和凭据边界，并不表示 Kagi 搜索可以离线
工作。

服务器使用稳定版 TypeScript SDK v2 的 stdio 入口。新版客户端可以通过无状态
`server/discover` 协商使用 MCP `2026-07-28`，较早客户端则可以让同一个可执行
程序处理旧版 initialize 握手；无需为不同客户端设置专用开关。

项目有意不启用 Streamable HTTP 传输。网络监听器会围绕一个可广泛访问个人
Kagi 会话的 Session Link，引入认证、授权、TLS、部署和多用户凭据隔离等
问题；这些内容超出了本项目的单用户设计范围。如果你需要可远程访问或获得
生产支持的服务，请使用 Kagi 官方托管 MCP。

## 要求

- 推荐使用 Node.js 24 LTS；请安装最新的 24.x 版本
  （本文更新时为 [24.18.0](https://nodejs.org/en/blog/release/v24.18.0)）。
  最低支持版本仍为 20.18.1。
- 个人 Kagi 付费账户
- 从 Kagi Control Center 获取的当前有效 Session Link

## 快速开始

先从 Kagi Control Center 获取 Session Link，再在启动 MCP 客户端的同一环境中
设置它。该值可以是原始令牌，也可以是完整的 Session Link。

PowerShell：

```powershell
$env:KAGI_SESSION_TOKEN = Read-Host "Paste the Kagi token or complete Session Link"
```

macOS、Linux 或 WSL：

```bash
read -rsp "Paste the Kagi token or complete Session Link: " KAGI_SESSION_TOKEN
export KAGI_SESSION_TOKEN
printf '\n'
```

从下面选择一种客户端配置即可。所有方式都由客户端通过 `npx` 运行此包，
无需全局安装。切勿把真实凭据写入代码仓库、命令参数或共享配置文件。

## 安装到 MCP 客户端

所有客户端都会启动同一个本地 stdio 命令：

```text
npx -y kagi-mcp-gpt-5.6-sol-ultra
```

客户端必须把 `KAGI_SESSION_TOKEN` 传给该进程。建议由客户端进程继承该变量，
或从本地密钥存储中解析它，而不是把真实值写进配置文件。

### Claude Code

在同一个终端中设置 `KAGI_SESSION_TOKEN` 后运行：

```bash
claude mcp add --scope user --transport stdio kagi-session -- npx -y kagi-mcp-gpt-5.6-sol-ultra
claude mcp get kagi-session
```

从该环境启动 Claude Code，并使用 `/mcp` 验证服务器。用户级作用域会让此工具
在所有项目中可用。请参阅官方
[Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)。

### Codex

将以下内容添加到 `~/.codex/config.toml`（Windows 上通常是
`C:\Users\YOUR_USER\.codex\config.toml`）：

```toml
[mcp_servers.kagi_session]
command = "npx"
args = ["-y", "kagi-mcp-gpt-5.6-sol-ultra"]
env_vars = ["KAGI_SESSION_TOKEN"]
```

`env_vars` 会从本地 Codex 进程转发 `KAGI_SESSION_TOKEN`，无需把它的值写入
`config.toml`。请从已经设置该环境变量的环境中启动 Codex；修改配置后，
重新启动 Codex。在 Codex TUI 中，可使用 `/mcp` 确认服务器已经初始化。

共享的 Codex MCP 配置格式请参阅官方
[Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp.md)。

### OpenClaw

先在启动 OpenClaw 的环境中设置 `KAGI_SESSION_TOKEN`，然后保存 stdio
服务器定义；这样无需把密钥复制到 OpenClaw 配置中：

```bash
openclaw mcp set kagi-session '{"command":"npx","args":["-y","kagi-mcp-gpt-5.6-sol-ultra"],"env":{"KAGI_SESSION_TOKEN":"${KAGI_SESSION_TOKEN}"},"requestTimeoutMs":60000,"connectionTimeoutMs":30000,"toolFilter":{"include":["kagi_search","kagi_list_lenses"]}}'
openclaw mcp doctor kagi-session --probe
```

`${KAGI_SESSION_TOKEN}` 会在激活时从 OpenClaw 进程环境中解析。OpenClaw
也可以从受信任的全局环境文件 `~/.openclaw/.env` 加载它。请参阅官方
[OpenClaw MCP](https://docs.openclaw.ai/cli/mcp) 和
[环境变量](https://docs.openclaw.ai/help/environment)文档。在 Windows 上，
OpenClaw 推荐使用 [WSL2](https://docs.openclaw.ai/windows) 以获得最佳兼容性。

### Hermes Agent

先把凭据写入 Hermes Agent 的私有环境文件：

```dotenv
# ~/.hermes/.env
KAGI_SESSION_TOKEN=your_token_or_complete_session_link
```

然后在 `~/.hermes/config.yaml` 中添加服务器：

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

`~/.hermes/.env` 是本地明文文件，请限制其访问权限，并且不要提交或分享它。
先用 `hermes mcp test kagi` 和 `hermes mcp list` 验证服务器，再启动
`hermes chat`。如果在会话期间修改了配置，请使用 `/reload-mcp`；Hermes
会以 `mcp_kagi_kagi_search` 等名称暴露这些工具。请参阅官方
[Hermes Agent MCP 指南](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp/)。

### 其他 MCP 客户端

对于使用常见 `mcpServers` JSON 结构的客户端：

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

不同客户端对环境变量展开的支持并不相同。如果你的客户端不支持，请使用其
本地密钥存储；不要把真实值写进共享配置。

## 工具参考

`kagi_search` 接受以下字段：

| 字段 | 默认值 | 用途 |
| --- | ---: | --- |
| `query` | 必填 | 搜索文本；允许使用 `site:` 等 Kagi 运算符 |
| `limit` | `20` | 返回 1-20 个自然搜索结果；默认值对应一个完整的 Kagi 轻量结果页 |
| `page` | `1` | 第 1-10 页；只在需要时分页 |
| `time_range` | `any` | `any`、`day`、`week`、`month` 或 `year` |
| `sort` | `relevance` | `relevance`、`recency`、`website` 或 `ad_trackers` |
| `region` | `no_region` | 小写 Kagi 地区代码，例如 `us`、`gb`、`cn`、`jp` 或 `no_region`；也接受 `ca_fr` 等语言地区变体 |
| `lens` | 无 | 已知 Lens 名称，或来自 `kagi_list_lenses` 的数字型已启用 Lens ID |
| `verbatim` | `false` | 请求更严格的字面查询匹配 |

响应包含 Markdown 文本回退和结构化 MCP 内容。其 `filters` 对象会记录解析后
的数字 Lens ID 和其他已应用参数。`contentScope` 为
`kagi_search_snippets`：每个 `snippet` 都来自 Kagi 搜索结果页面。MCP 不会
抓取或解析目标页面，也不会调用 Kagi 独立的 Summarize 功能。搜索结果文本是
不受信任的网页内容，不是指令。`pageResultCount` 表示 Kagi 在当前轻量页面
返回的自然结果卡片数量；只有当请求的 `limit` 在本地隐藏了其中一部分卡片
时，`truncated` 才为 true。

### Lens 选择

`kagi_list_lenses` 是 Lens 发现工具，不执行搜索。它读取当前登录账户的
Lens 设置，返回每个 Lens 的名称、说明、稳定数字 ID 和启用状态。智能体仅在
需要按 Lens 搜索时调用它，再把已启用的 ID 传给 `kagi_search.lens`。

Lens 列表会短暂缓存，也不会消耗一次搜索。如果请求的 Lens 未启用，或者
Kagi 忽略了它，`kagi_search` 会返回 `filter_rejected`，而不是悄悄返回
未过滤的结果。

典型流程：`kagi_list_lenses` → 选择一个已启用的数字 ID →
在 `kagi_search` 的 `lens` 参数中传入该 ID。

## 失败行为

- `authentication` —— 更新 Session Link 和环境变量，然后重新启动。
- `forbidden` —— 会话可能已过期，或者 Kagi 可能拒绝当前 IP。
- `filter_rejected` —— 在 Kagi 设置中启用 Lens，或选择一个已启用的 ID。
- `rate_limited` —— 等待所报告的时间后再重试。
- `parser_changed` —— Kagi 的页面结构可能已经变化；请升级此软件包，或
  [提交问题](https://github.com/real-jiakai/kagi-mcp-gpt-5.6-sol-ultra/issues)。
- `timeout` / `upstream` —— 有边界的网络故障或 Kagi 服务故障。

所有智能体可见错误都会经过清理。原始响应正文和请求头绝不会被记录。
