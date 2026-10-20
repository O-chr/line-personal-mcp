# ChatGPT connection investigation — 2026-10-20

## Findings

- The local Codex configuration has enabled `line_mcp` and `icloud_mcp` OAuth servers. `line_official` uses a local header helper. None of these entries has a configured tool allow/deny filter that hides the personal LINE tools.
- The local app logs mark `line_mcp` ready. The server log records successful OAuth refresh, initialization, tool discovery, and a tool call. The initial unauthenticated discovery request returning 401 is expected; the later authenticated requests succeed.
- The Codex chat exposes `line_status`, `line_list_chats`, and `line_read_messages`, and no send tool. An actual `line_list_chats` call at 20:38 JST returned nine allowed chats, all readable and none writable. No message bodies or LINE sends were requested.
- iCloud tools are also exposed in this Codex chat; no iCloud tool was called or modified.
- The LINE Official Account integration has both a local MCP registration and an account-backed ChatGPT plugin. The account's complete owned-personal-plugin listing contained no personal LINE plugin. The local plugin cache likewise has the official integration, with an App binding, but no personal LINE plugin.
- Tool discovery in local Codex is therefore insufficient evidence for ordinary ChatGPT Chat. The missing ChatGPT plugin registration explains the observed difference; the original hosted chat's complete model tool inventory was not available for inspection.
- The server instructions received by the local client include the recently added “Personal LINE” wording. The tool descriptions visible in this existing Codex conversation still use older wording. This discrepancy does not prove a particular cache bug or that wording caused the earlier failure.
- The only app-tool discovery failure found for these LINE/iCloud server names was an unauthenticated `line_mcp-2` attempt at 14:45 JST, before its successful login. It does not explain later failures after connection.

## Change

Add the private `line-personal` plugin package under `plugin/line-personal/`, using the existing URL, Streamable HTTP, OAuth and DCR. Include a focused skill that routes personal LINE requests to these tools and respects the existing read-only allow list. No server runtime code, authentication, policy, launchd, DNS, tunnel, iCloud configuration, or LINE installation is changed.

The plugin must be installed and authenticated in ChatGPT, then explicitly selected in a new ChatGPT chat. Do not put Google client secrets, LINE sessions, OAuth tokens, or real chat exports in the package or this report.

Created as a **USER-scoped, PRIVATE** plugin (not shared or public):

- [個人LINE](https://chatgpt.com/plugins/plugins_6ad753b939e481919a79b1bef8d4f99f)
- Plugin ID: `plugins_6ad753b939e481919a79b1bef8d4f99f`
- Release ID: `pluginrel_6ad753bacee88191b8179d37153f2079`
- Version: `0.1.0`

`npx tsc` and `npm test` passed (7 tests). The three-file archive was checked for valid manifest structure, OAuth DCR configuration, the unchanged endpoint, subtitle length, archive integrity, and absence of credential fields. Runtime source is unchanged, so no launchd restart is needed.

## Verification boundary

The nine-chat tool result above is verified **in Codex**, not in normal ChatGPT Chat. The app UI automation tool refused access to this app, and the thread reader returned content references rather than the text of earlier ChatGPT answers. Neither limitation was bypassed. Final ChatGPT verification requires the installed plugin to invoke `line_list_chats` in that surface and return the same allowed nine chats. Plugin creation or an HTTP 200 alone does not establish completion.

## Follow-up: installed skill without ChatGPT tools

The user tested the installed plugin in normal ChatGPT Chat and reported that the skill loaded but `line_list_chats` was absent. The package upload above did **not** complete the ChatGPT MCP registration.

The supported ChatGPT web UI was then inspected separately from the blocked native app UI. The `line-personal` detail page shows **MCP servers: 1** and **Skills: 1**, with no App binding or OAuth management action. The working official LINE integration shows **Apps: 1**, a management link, and a chat action. Reading back the personal package confirms that `mcp.json` exists but `.app.json` and `extensions.com.openai.apps` are absent.

The official packaging guide's [Create and test a plugin locally with an MCP server](https://developers.openai.com/plugins/build/plugins#create-and-test-a-plugin-locally-with-an-mcp-server) explicitly requires registering the connection with **Add custom MCP server**, then using the returned `plugin_asdk_app...` identity for the App mapping. A portable remote MCP entry alone did not provision that hosted connection in this case. Keep the current package identity; bind only a verified App ID after registration, never fabricate one.

Prepared the ChatGPT web registration form for **個人LINE MCP**, using the unchanged endpoint `https://line-mcp.o-chr.jp/mcp` and OAuth. ChatGPT successfully discovered `/authorize`, `/token`, and `/register` and selected DCR. No Google client secret, LINE session, or OAuth token was copied into the form. Creating/connecting the authenticated ChatGPT integration still requires action-time confirmation; until it is completed and a normal chat returns nine rows, the issue remains open.

## Official references

- [MCP configuration and hosted ChatGPT connections](https://learn.chatgpt.com/docs/extend/mcp?surface=cli): hosted ChatGPT uses installed plugins; local Codex configuration is not read by ChatGPT web.
- [Connect an MCP server in ChatGPT](https://developers.openai.com/plugins/build/app-quickstart): create/install the plugin, select it with `@`, and verify a real tool call.
- [Plugin quickstart](https://developers.openai.com/plugins/quickstart): account plugin creation and installation are separate steps.
