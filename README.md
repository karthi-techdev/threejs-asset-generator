# threejs-asset-generator

**Generate interactive, export-ready procedural 3D assets directly in your browser using any AI web chat or coding agent over HTTPS MCP.**

Live App: **https://threejs-asset-generator.vercel.app**

Connect **Gemini Web**, **Claude Web**, **Claude Desktop**, **Cursor**, **Antigravity**, or any remote MCP client directly to your private live 3D viewport using a custom session token URL — no local setup required:

```text
https://threejs-asset-generator.vercel.app/mcp?token=<your-session-token>
```

---

## Live Showcase: Output Generated in Gemini 4 Neon Update

### 1. Reference Picture
The input 2D stylized reference image provided to **Gemini 4 Neon Update** over MCP:

![Input Reference Image](./reference-image.png)

---

### 2. Live 3D Model & Animation Output (Video)

Procedural 3D model with custom animations (drift, drive, idle, wipers, steer), articulated mechanical joints, and standard glTF 2.0 PBR materials:

https://github.com/user-attachments/assets/result-gif.mp4

<video src="./result-gif.mp4" controls width="100%"></video>

[**Click here to watch / download the 1080p animation video (`result-gif.mp4`)**](./result-gif.mp4)

> **Generated in Gemini 4 Neon Update**: Pure procedural Three.js asset generated over the Model Context Protocol (MCP) in a single session from the reference picture above. The model includes articulated pivots, animated wheels and wipers, multi-layer PBR materials, and clean `.GLB` export ready for Sketchfab, Blender, Unity, and Unreal Engine.

---

## Quick Start for Any User (No Setup Needed)

1. Open **https://threejs-asset-generator.vercel.app** in your browser.
2. Click the **MCP Server** tab in the right panel.
3. Enter your own **Session Token** (e.g. `my-session`) or click **Generate** — it is saved automatically in your browser's `localStorage`.
4. Copy your private **HTTPS MCP Server URL**:
   ```text
   https://threejs-asset-generator.vercel.app/mcp?token=<your-session-token>
   ```
5. Paste that URL into your AI client's MCP settings (**Gemini Web**, **Claude Web**, **Claude Desktop**, **Cursor**, or **Antigravity**).
6. Send a text prompt or reference image to your AI agent. It will call `push_3d_code` to sculpt the model live in your viewport and `get_viewport_screenshot` to visually inspect and refine it.
7. Export the finished model as a textured **`.GLB`** file or download the clean **TypeScript (`.ts`)** source code with one click.

---

## Features

- **Stateless HTTPS MCP Server (No SSE)**: Pure JSON-RPC 2.0 over standard HTTPS `POST /mcp?token=<session>` — fast, firewall-friendly, and 100% compatible with Vercel Serverless Functions and web chat MCP connectors.
- **Private Session Token Isolation**: Every user sets their own custom session token in the UI (persisted in `localStorage`). Only agents connecting with your matching `?token=<your-session>` can push code to or capture screenshots from your viewport.
- **Visual Self-Correction Loop**: Your browser automatically captures and syncs live WebGL renders so connected AI agents can call `get_viewport_screenshot` to inspect shapes, colors, lighting, and proportions.
- **Interactive 3D Viewport & Textured `.GLB` Export**: OrbitControls, wireframe/grid toggles, backdrop presets, camera angle presets, live FPS/polygon stats, instant TypeScript execution, and glTF-compliant `.glb` export (automatically converting custom `ShaderMaterial`s into standard PBR RGBA textures).
- **Built-in Multi-Provider AI Panel**: Also supports direct API connections to **Google Gemini**, **Anthropic Claude**, **OpenAI**, **Local Ollama**, or any **Custom OpenAI-compatible API** with dynamic model fetching and `localStorage` persistence.
- **Bundled Three.js Skills Library**: Includes 13 curated Three.js skill modules (`geometry`, `materials`, `shaders`, `textures`, `lighting`, `animation`, `performance`, etc.) exposed via the `get_threejs_skills` MCP tool.

---

## MCP Client Configuration

### Web Chat Agents (Gemini Web / Claude Web)
Add a custom Remote MCP Server / Integration using your copied HTTPS URL:
```text
https://threejs-asset-generator.vercel.app/mcp?token=example-session
```

### Desktop / IDE MCP Config (JSON)
```json
{
  "mcpServers": {
    "threejs-asset-generator": {
      "url": "https://threejs-asset-generator.vercel.app/mcp?token=example-session"
    }
  }
}
```

### Exposed MCP Tools
| Tool | Description |
| :--- | :--- |
| `push_3d_code` | Push executable Three.js TypeScript/JavaScript (`export function createModel(): THREE.Group`) live into the browser viewport. |
| `get_viewport_screenshot` | Capture and return the latest WebGL canvas render as an MCP `image/png` block for visual inspection. |
| `get_current_code` | Read the current Three.js code loaded in the active session. |
| `get_threejs_skills` | Query patterns and recipes from the 13 bundled Three.js skill modules. |
| `clear_viewport` | Clear the active 3D model from the viewport. |

---

## Self-Hosting & Local Development

### Run Locally
```bash
git clone https://github.com/karthi-techdev/threejs-asset-generator.git
cd threejs-asset-generator
npm install

# Terminal 1: Backend + HTTPS MCP server (port 3001)
npm run dev

# Terminal 2: Frontend dev server (port 3000, proxies /api and /mcp)
npm run dev:client
```

Open `http://localhost:3000` in your browser.

### Deploy Your Own on Vercel
1. Fork or import this repository into **Vercel**.
2. In your Vercel project → **Storage** → **Create Database** → attach a free **Upstash Redis** database so serverless invocations share session state (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set automatically).
3. Deploy — Vercel builds the Vite client into `dist/client` and mounts the unified Express + HTTPS MCP API via `vercel.json`.

---

## License
Apache-2.0
