import express from 'express';
import cors from 'cors';
import { runAgentOrchestrator, fetchAvailableModels, type GenerateRequest, type FetchModelsRequest } from './agents.js';
import { getAllSkills } from './skillLoader.js';
import { sessionStore } from './sessionStore.js';
import { expressMcpHandler } from './mcpHandler.js';

export const app = express();

app.use(cors());

// Guard against double body-parsing when deployed on Vercel Serverless Functions
app.use((req, _res, next) => {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string' && req.body.trim().startsWith('{')) {
      try {
        req.body = JSON.parse(req.body);
      } catch {
        // leave raw string
      }
    }
    if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
      (req as any)._body = true;
    }
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- MCP (Model Context Protocol) Endpoint: Pure HTTPS JSON-RPC 2.0 (Stateless, No-SSE) ---
app.all('/mcp', expressMcpHandler);
app.all('/api/mcp', expressMcpHandler);

// --- API Routes ---

/**
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  res.json({
    name: 'threejs-asset-generator',
    status: 'ok',
    version: '1.0.0',
    mcp: {
      enabled: true,
      transport: 'streamable-http-json',
      sseEnabled: false,
      endpoint: '/mcp',
    },
    storage: sessionStore.getBackendType(),
    providers: {
      gemini: !!process.env.GEMINI_API_KEY,
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
      ollama: true,
      externalAgents: true,
    },
  });
});

/**
 * List Installed Three.js Skills (CloudAI-X/threejs-skills)
 */
app.get('/api/skills', (_req, res) => {
  const allSkills = getAllSkills();
  const list = Array.from(allSkills.values()).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    category: s.category,
  }));
  res.json({ success: true, count: list.length, skills: list });
});

/**
 * Dynamically Fetch Models from Selected Provider / Custom URL & API Key
 */
app.post('/api/models', async (req, res) => {
  try {
    const payload = req.body as FetchModelsRequest;
    if (!payload.provider) {
      return res.status(400).json({ error: 'Provider is required.' });
    }

    const models = await fetchAvailableModels(payload);
    res.json({ success: true, count: models.length, models });
  } catch (err: any) {
    console.error('Fetch Models Error:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch models from provider.' });
  }
});

/**
 * AI Agent Generation / Sculpting Endpoint
 * Routes to Gemini, Claude, OpenAI, Ollama, or Custom OpenAI-compatible API
 */
app.post('/api/generate', async (req, res) => {
  try {
    const payload = req.body as GenerateRequest;
    if (!payload.prompt && !payload.image) {
      return res.status(400).json({ error: 'Either prompt or image is required.' });
    }

    const result = await runAgentOrchestrator(payload);
    res.json(result);
  } catch (err: any) {
    console.error('Agent Orchestrator Error:', err);
    res.status(500).json({ error: err.message || 'Agent generation failed.' });
  }
});

/**
 * --- External Coding Agent & Live Browser Session Endpoints ---
 */

// Push code to active session
app.post('/api/sessions/:id/code', async (req, res) => {
  const { id } = req.params;
  const { code, title } = req.body;

  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required and must be a string.' });
  }

  try {
    const session = await sessionStore.saveCode(id, code, title);
    res.json({ success: true, session });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save code.' });
  }
});

// Fetch current code for a session
app.get('/api/sessions/:id/code', async (req, res) => {
  const { id } = req.params;
  const session = await sessionStore.getSession(id);
  if (!session) {
    return res.json({ session: null });
  }
  res.json({ session });
});

// Web client reports rendered canvas screenshot back to server
app.post('/api/sessions/:id/render', async (req, res) => {
  const { id } = req.params;
  const { screenshot } = req.body;

  if (!screenshot) {
    return res.status(400).json({ error: 'Screenshot data URL is required.' });
  }

  try {
    await sessionStore.saveRender(id, screenshot);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save render capture.' });
  }
});

// External AI agent calls this to inspect what the 3D model looks like in the viewport
app.get('/api/sessions/:id/render', async (req, res) => {
  const { id } = req.params;
  const session = await sessionStore.getSession(id);
  if (!session || !session.latestRender) {
    return res.status(404).json({ error: `No render capture found for session "${id}".` });
  }

  res.json({
    id,
    updatedAt: session.updatedAt,
    renderUrl: session.latestRender,
  });
});

export default app;
