# threejs-asset-generator

A procedural 3D asset generator and live Three.js viewport powered by a **Stateless HTTPS JSON-RPC 2.0 MCP Server (no SSE)**, multi-agent APIs, and the `cloudai-x/threejs-skills` library.

Connect any web chat agent or coding agent (Claude, ChatGPT, Cursor, Antigravity, or custom MCP clients) directly to your live browser viewport using a custom session token URL:

```text
https://threejs-asset-generator.vercel.app/mcp?token=example-session
```

---

## Features

- **HTTPS MCP Server (No SSE)**: Stateless JSON-RPC 2.0 over standard HTTP/HTTPS `POST /mcp?token=<session>`. No long-lived SSE connections, making it 100% compatible with Vercel Serverless Functions and modern remote MCP clients.
- **Session-Token Isolation**: Create or generate your own custom session token in the UI (persisted in `localStorage`). Only agents connecting with your matching `?token=<your-session>` can push 3D assets to or inspect screenshots from your viewport.
- **Live 3D Viewport & glTF/GLB Export**: Interactive Three.js WebGL viewport with OrbitControls, wireframe/grid toggles, live polygon & FPS stats, TypeScript execution via Sucrase, and glTF-compliant `.glb` export (auto-converting custom `ShaderMaterial`s into standard PBR RGBA textures).
- **Visual Feedback Loop**: The browser automatically captures and uploads the WebGL canvas render so connected MCP agents can call `get_viewport_screenshot` to visually inspect and iteratively refine models.
- **Multi-Provider AI Panel**: Connect Google Gemini, Anthropic Claude, OpenAI, Local Ollama, or any Custom OpenAI-compatible API with dynamic model fetching and `localStorage` persistence.
- **Embedded Three.js Skills Engine**: Bundled with 13 `cloudai-x/threejs-skills` modules accessible both to built-in AI calls and via the `get_threejs_skills` MCP tool.

---

## MCP Endpoint & Tools

### Endpoint URL
```text
POST https://threejs-asset-generator.vercel.app/mcp?token=<your-session-token>
```

### MCP Client Configuration
```json
{
  "mcpServers": {
    "threejs-asset-generator": {
      "url": "https://threejs-asset-generator.vercel.app/mcp?token=example-session"
    }
  }
}
```

### Available Tools
| Tool | Description |
| :--- | :--- |
| `push_3d_code` | Push executable Three.js TypeScript/JavaScript (`export function createModel(): THREE.Group`) live into the browser viewport. |
| `get_viewport_screenshot` | Capture and return the latest WebGL canvas render as an MCP `image/png` block for visual inspection. |
| `get_current_code` | Read the current Three.js code loaded in the session. |
| `get_threejs_skills` | Query patterns and recipes from the 13 bundled Three.js skills (`shaders`, `geometry`, `materials`, `textures`, `lighting`, etc.). |
| `clear_viewport` | Clear the active 3D model from the viewport. |

---

## Local Development

```bash
npm install

# Terminal 1: Express + HTTPS MCP backend (port 3001)
npm run dev

# Terminal 2: Vite frontend (port 3000, proxies /api and /mcp to 3001)
npm run dev:client
```

Open `http://localhost:3000`, switch to the **MCP Server** tab, enter a custom session token (e.g. `example-session`), and copy your MCP URL.

---

## Deploying to Vercel

1. Push this repository to GitHub and import it into Vercel as `threejs-asset-generator`.
2. Add an **Upstash Redis** (or Vercel KV) integration in your Vercel project so stateless serverless functions share session state across invocations:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. Deploy — Vercel builds the Vite client into `dist/client` and mounts `api/mcp.ts` at `/mcp` and `api/[...path].ts` at `/api/*` automatically via `vercel.json`.

---

## License
Apache-2.0
