# UnityPilot

**An MCP server that lets an AI agent drive the full Unity lifecycle — without you ever opening the Unity Editor by hand.**

Point Claude Code (or any MCP host) at UnityPilot and it can find/launch your Unity editor, create a project, open it, build scenes, create GameObjects, write and compile C# scripts, import assets, **screenshot the view**, read the console, and run tests — driving a real, visible editor you watch live.

```
You ──prompts──▶ Claude Code ──MCP──▶ UnityPilot (this server) ──WebSocket──▶ Unity Editor + bundled C# bridge
```

---

## ⚠️ v1 is macOS only

Apple Silicon (`arm64`) and Intel (`x64`) are supported. Windows and Linux exist only as `NotImplemented` resolver stubs for contributors to fill in (see [Contributing](#contributing)). Installing on a non-macOS host is intentionally unsupported.

## Requirements

- **macOS** (Apple Silicon or Intel)
- **Node.js ≥ 22**
- **[Unity Hub](https://unity.com/download)** already installed (UnityPilot installs *editors* via the Hub CLI; it does not install the Hub)
- A Unity account/license activated in the Hub (a free Personal license is fine)

## Install

Add UnityPilot to your MCP host. For **Claude Code**, add this to your `.mcp.json` (project-scoped) or your user MCP config:

```json
{
  "mcpServers": {
    "unitypilot": {
      "command": "npx",
      "args": ["-y", "unitypilot"],
      "env": {
        "UNITY_MCP_PROJECT_ROOT": "/absolute/path/to/your/UnityProject"
      }
    }
  }
}
```

`UNITY_MCP_PROJECT_ROOT` is optional — it defaults to the current working directory. One project per session.

Restart your MCP host (or `/mcp` reconnect in Claude Code) and call the **`status`** tool — it returns the current lifecycle state and the next tool to call. That's your starting anchor.

## Quickstart

Just talk to your agent:

> "Make sure a Unity editor is installed, create a project, launch it, add a cube to a new scene, write a script that spins the cube and attach it, then screenshot the result."

The agent walks the lifecycle for you: `ensure_editor` → `create_project` → `launch` → `scene_create` → `gameobject_create_primitive` → `script_write` → `screenshot`. The editor is **visible by default** so you can watch it happen; pass `launch headless:true` for CI.

## Tools

**Lifecycle** (state machine: `none → editor_ready → project_created → launched`)
| Tool | Does |
|---|---|
| `status` | Report lifecycle state, frozen paths, bridge connectivity, next tool. Legal anywhere — the resume anchor. |
| `ensure_editor` | Detect/install a Unity editor for your arch via the Hub CLI. |
| `create_project` | Create a Unity project and inject the bridge. |
| `launch` | Boot the editor (visible by default; `headless:true` for `-batchmode -nographics`). |
| `shutdown` | Cleanly stop the editor. |

**Scene & GameObjects** (legal once `launched`)
`scene_create` · `scene_save` · `scene_get_info` · `gameobject_create_primitive` · `gameobject_update` · `component_add` · `gameobject_get`

**Authoring & feedback**
| Tool | Does |
|---|---|
| `script_write` | Write a C# script under `Assets/`, compile it (survives the domain reload), and optionally attach it as a component. Returns compiler errors as `compile_failed` so the agent can fix and retry. |
| `import_assets` | Copy asset files into `Assets/<destination>` and import them. |
| `read_console` | Read the Unity console (filter by `error`/`warning`/`info`) — the other half of the error→fix loop. |
| `screenshot` | Render a camera to a PNG (inline image + saved to `.unity-mcp/screenshots/`). Optional `camera`/`mode`/`width`/`height`. Interactive only (needs a GPU). |
| `run_tests` | Run the Unity Test Runner (`EditMode`/`PlayMode`) and return pass/fail + failures. |

Several tools briefly foreground Unity so a backgrounded editor doesn't throttle the work; pass `focusUnity:false` to opt out.

## How it works

UnityPilot is two pieces shipped as one package:

- **The orchestrator** (this npm package) — a Node/TypeScript MCP server. It owns macOS editor/project resolution, the lifecycle state machine, and a frozen `<project>/.unity-mcp/state.json` so resolved paths are computed once and never drift.
- **The C# bridge** (bundled UPM package) — injected into your project as a `file:` dependency. It runs a WebSocket server inside the editor that the orchestrator drives. A forked, headless-capable build (see attribution below).

## Out of scope for v1

Asset *generation* (UnityPilot wires up assets you provide; it doesn't synthesize art/audio), Windows/Linux, Unity Asset Store distribution, and fully autonomous *visual* correctness (you own the visual review — the screenshot channel is there to help). 

## Contributing

The platform-specific logic lives behind one interface in `src/resolver/`. Windows and Linux are `NotImplemented` stubs — implementing a resolver for those platforms is the most valuable contribution. No `process.platform` checks are scattered through the codebase; keep it that way.

## Attribution

The in-editor bridge is a fork of **[MCP Unity Server](https://github.com/CoderGamester/mcp-unity)** (`com.gamelovers.mcp-unity`) by **CoderGamester**, redistributed under the MIT License. The fork's changes (headless message pump, cooperative domain-reload handling, screenshot/primitive/refresh tools) are documented in `vendor/bridge/FORK.md`. See `vendor/bridge/LICENSE.md` for the upstream license.

## License

MIT © Anmol Bhardwaj. See [`LICENSE`](./LICENSE). Bundled bridge is MIT © CoderGamester.
