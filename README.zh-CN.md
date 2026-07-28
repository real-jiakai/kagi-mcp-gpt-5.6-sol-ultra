[English](./README.md) | [简体中文](./README.zh-CN.md)

# Kagi Session MCP

一个紧凑、仅限本地使用的 MCP 服务器，让 AI 智能体可以通过你自己的
Kagi 付费账户 Session Link 搜索 Kagi。

它提供两个只读工具：

- `kagi_search` —— 返回带排名的网页结果，包括标题、URL、域名、摘要、
  可选日期、相关查询、分页元数据，以及一个短时内存缓存。
- `kagi_list_lenses` —— 返回账户中已启用和未启用的 Lens，以及 Kagi
  当前 HTML 搜索前端所需的数字 ID。

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

项目有意不启用 Streamable HTTP 传输。网络监听器会围绕一个可广泛访问个人
Kagi 会话的 Session Link，引入认证、授权、TLS、部署和多用户凭据隔离等
问题；这些内容超出了本项目的单用户设计范围。如果你需要可远程访问或获得
生产支持的服务，请使用 Kagi 官方托管 MCP。

## 要求

- Node.js 20.18.1 或更高版本
- 个人 Kagi 付费账户
- 从 Kagi Control Center 获取的当前有效 Session Link

## 配置密钥

请在启动 MCP 客户端的同一环境中设置凭据。它可以是原始令牌，也可以是完整
的 Session Link。

以下 PowerShell 写法可避免直接把密钥写进命令行：

```powershell
$env:KAGI_SESSION_TOKEN = Read-Host "Paste the Kagi token or complete Session Link"
```

不要把真实值写入 `.env.example`。本项目不会自动加载 `.env` 文件，以免在
不知情的情况下把完整账户凭据复制到项目中。

## 从 npm 运行

无需全局安装。设置凭据后，通过以下命令运行公开 npm 包：

```powershell
npx -y kagi-mcp-gpt-5.6-sol-ultra
```

如需改为一次性全局安装：

```powershell
npm install --global kagi-mcp-gpt-5.6-sol-ultra
kagi-mcp-gpt-5.6-sol-ultra
```

直接启动时，命令会等待来自 stdin 的 MCP 消息，因此终端空闲等待属于正常
现象。日常使用时，应由 Codex 或其他 MCP 客户端启动它。

## 使用 npx 配置 Codex

Codex 通过 `command` 和 `args` 支持本地 stdio MCP 服务器。将以下内容添加
到 `~/.codex/config.toml`（Windows 上通常是
`C:\Users\YOUR_USER\.codex\config.toml`）：

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

`env_vars` 会从本地 Codex 进程转发 `KAGI_SESSION_TOKEN`，无需把它的值写入
`config.toml`。请从已经设置该环境变量的环境中启动 Codex；修改配置后，
重新启动 Codex。在 Codex TUI 中，可使用 `/mcp` 确认服务器已经初始化。

如果 Windows 找不到 `npx`，请将 `command = "npx"` 替换为 `npx.cmd` 的
绝对路径，例如：

```toml
command = "C:\\Users\\YOUR_USER\\.codex\\tools\\node\\npx.cmd"
```

共享的 Codex MCP 配置格式请参阅官方
[Codex MCP 文档](https://learn.chatgpt.com/docs/extend/mcp.md)。

## 其他 MCP 客户端

对于使用 JSON 配置的客户端，通过 `npx` 启动公开 npm 包：

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

许多桌面 MCP 客户端会以明文保存 `env` 对象。条件允许时，请优先使用继承的
环境变量或客户端提供的密钥存储。切勿把该配置文件发送给任何人。

## 本地源码与 Windows DPAPI 开发流程

开发、运行测试套件或使用随附的 Windows DPAPI 启动器时，请使用源码目录：

```powershell
git clone https://github.com/real-jiakai/kagi-mcp-gpt-5.6-sol-ultra.git
cd kagi-mcp-gpt-5.6-sol-ultra
npm install
npm run check
```

构建输出位于 `dist`。

### DPAPI 凭据启动器

如需长期使用本地 Codex 开发版本，请为当前 Windows 用户加密保存凭据：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\scripts\store-session-token.ps1
```

然后将以下内容添加到 `C:\Users\YOUR_USER\.codex\config.toml`，并将检出目录
替换为它的绝对路径：

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

加密值保存在 `%APPDATA%\kagi-session-mcp\session-token.dpapi`。启动器只在
内存中解密它，启动本地构建的 MCP 服务器，并直接转发 MCP stdio。该启动器
属于源码目录；上面的 npm/npx 配置则使用继承的环境变量。修改 `config.toml`
后请重新启动 Codex。

在不暴露凭据的情况下测试实际安装的启动器：

```powershell
npm run build
npm run smoke:installed
```

如需通过同一个 DPAPI 启动器测试已安装 MCP 的分页、按精确 URL 去重，并输出
单个汇总 JSON 对象：

```powershell
npm run build
npm run smoke:installed:all
```

该命令会搜索 `KAGI_SMOKE_QUERY`（默认值：`gemini 3.5 pro`），每页返回
20 个结果，直到 Kagi 表示没有下一页或已经抓取 10 页。单个 JSON 响应包含
逐页元数据、全局编号的唯一结果，以及跨页移除的重复 URL 精确数量。

## 可选的实时冒烟测试

自动化测试套件绝不会使用真实账户。在源码目录中设置环境变量后，可主动执行
一次实时搜索：

```powershell
npm run build
npm run smoke
```

可以在不把凭据写进命令行的情况下选择测试查询：

```powershell
$env:KAGI_SMOKE_QUERY = "Model Context Protocol"
npm run smoke
```

## 面向智能体的契约

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

对于常见的内置 Lens，智能体可以直接传入以下名称之一：

| 名称 | 当前 Lens ID |
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

账户可以禁用内置 Lens，也可以添加自定义 Lens。为了让智能体行为保持确定，
请调用 `kagi_list_lenses` 并传入其返回的数字 ID。该列表来自
`/html/settings/lenses`，只会短暂缓存，并且不会消耗一次搜索。如果请求的
Lens 未启用，或者 Kagi 忽略了它，`kagi_search` 会以 `filter_rejected`
关闭失败，而不是悄悄返回未过滤的结果。

### 浏览器验证过的 URL 映射

当前 Kagi UI 已在登录状态的 Chrome 会话中完成验证：

- 已选择 Lens：`lens=<stable numeric Lens ID>`；
- 已选择国家/地区：`r=<code>`；
- 不使用 Lens：省略 `lens`，而不是使用有状态的“上次使用的 Lens”开关；
- 普通结果第 2 页：`batch=2`；
- Lens 结果第 2 页：`page=2`。

MCP 有意不使用旧版 `l=<menu position>` 参数。账户重新排序 Lens 后，菜单
位置会改变；Kagi Lens 设置页显示的 ID 则是稳定的。Kagi 官方 Search API
使用另一套协议（JSON 中的 `lens_id`），不应与这个基于 Session 的 HTML
端点混用。

## 运行时控制

| 环境变量 | 默认值 | 允许范围 |
| --- | ---: | ---: |
| `KAGI_TIMEOUT_MS` | `15000` | `1000`-`30000` |
| `KAGI_CACHE_TTL_MS` | `60000` | `0`-`600000` |
| `KAGI_MAX_CONCURRENCY` | `2` | `1`-`4` |

缓存仅存在于内存中，并会在 MCP 进程退出时消失。项目有意禁用自动 HTTP
重试，以免一次智能体调用在不知情的情况下消耗多次搜索。

## 失败行为

- `authentication` —— 更新 Session Link 和环境变量，然后重新启动。
- `forbidden` —— 会话可能已过期，或者 Kagi 可能拒绝当前 IP。
- `filter_rejected` —— 在 Kagi 设置中启用 Lens，或选择一个已启用的 ID。
- `rate_limited` —— 等待所报告的时间后再重试。
- `parser_changed` —— Kagi 返回了有效 HTML，但它不再匹配已观察到的结果
  结构；在信任结果前，请更新测试夹具和解析器。
- `timeout` / `upstream` —— 有边界的网络故障或 Kagi 服务故障。

所有智能体可见错误都会经过清理。原始响应正文和请求头绝不会被记录。

## 开发

```powershell
npm test
npm run typecheck
npm run build
```

测试覆盖 Session Link 规范化、欺骗性主机拒绝、搜索与 Lens 设置解析、稳定
Lens ID 解析、Lens 与普通搜索分页、地区变体、令牌不披露、认证重定向、
速率限制、过滤器拒绝和缓存复用。真实账户测试仅在明确选择时才会运行。
