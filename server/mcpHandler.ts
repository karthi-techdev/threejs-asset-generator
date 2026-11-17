import type { Request, Response } from 'express';
import { sessionStore, sanitizeSessionToken } from './sessionStore.js';
import { getAllSkills, getRelevantSkills } from './skillLoader.js';

const SUPPORTED_PROTOCOL_VERSIONS = new Set(['2025-06-18', '2025-03-26', '2024-11-05']);

/**
 * Extracts session token from HTTP request query params, custom headers, or Authorization.
 * Returns empty string if no token is provided.
 */
export function extractSessionToken(req: {
  query?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
  url?: string;
}): string {
  // 1. Query parameter ?token=xxx
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    return sanitizeSessionToken(req.query.token);
  }

  // 2. Custom header x-session-token
  const headerToken = req.headers?.['x-session-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return sanitizeSessionToken(headerToken);
  }

  // 3. Authorization: Bearer xxx
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return sanitizeSessionToken(bearer);
  }

  // 4. URL fallback parsing
  if (req.url && req.url.includes('token=')) {
    try {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const param = parsedUrl.searchParams.get('token');
      if (param) return sanitizeSessionToken(param);
    } catch {
      // ignore malformed URL
    }
  }

  return '';
}

/**
 * Tool definitions exposed to MCP clients
 */
export const MCP_TOOLS = [
  {
    name: 'push_3d_code',
    description:
      "Push and execute procedural Three.js 3D module code directly into the user's live browser viewport in real time. The code compiles instantly and renders the 3D model.",
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'Complete executable Three.js TypeScript/JavaScript code module. Must export function createModel(): THREE.Group (or THREE.Object3D) with procedural geometries, materials, and optional animation loop in root.userData.tick(delta, elapsed).',
        },
        title: {
          type: 'string',
          description: 'Optional name/title of the 3D model or asset.',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'get_viewport_screenshot',
    description:
      "Captures and returns the current rendered 3D scene from the user's live browser viewport as a real-time PNG image. Use this visual feedback to inspect your model, evaluate likeness, colors, materials, lighting, scale, and iteratively self-correct.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_current_code',
    description: "Retrieves the current Three.js code loaded in the user's live browser viewport.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_threejs_skills',
    description:
      'Access the installed CloudAI-X/threejs-skills library (geometry, shaders, materials, lighting, textures, animation, performance) for verified patterns, code recipes, and best practices.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'Specific skill topic or keywords to query (e.g., "shaders", "materials", "lighting", "foliage", "geometry", "animation", "textures", "performance"). Leave blank to view all available modules.',
        },
      },
    },
  },
  {
    name: 'clear_viewport',
    description: "Clears the active 3D model from the user's browser viewport.",
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

/**
 * Handles a single JSON-RPC 2.0 message over pure HTTPS (Stateless, No-SSE).
 * Returns `null` for notifications (messages without an `id`).
 */
export async function handleMcpRpcMessage(
  rpcBody: any,
  sessionToken: string,
  host: string
): Promise<any | null> {
  if (!rpcBody || typeof rpcBody !== 'object') {
    return {
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request: JSON body must be an object.' },
    };
  }

  const hasId = Object.prototype.hasOwnProperty.call(rpcBody, 'id') && rpcBody.id !== undefined;
  const id = hasId ? rpcBody.id : null;
  const method = rpcBody.method;

  if (!method || typeof method !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request: method is missing or not a string.' },
    };
  }

  // Notifications (no id) -> acknowledge with 202 Accepted (null body)
  if (!hasId || method.startsWith('notifications/')) {
    return null;
  }

  // 1. initialize
  if (method === 'initialize') {
    const requestedVersion = rpcBody.params?.protocolVersion;
    const protocolVersion =
      typeof requestedVersion === 'string' && SUPPORTED_PROTOCOL_VERSIONS.has(requestedVersion)
        ? requestedVersion
        : '2025-03-26';

    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: 'threejs-asset-generator',
          version: '1.0.0',
        },
      },
    };
  }

  // 2. ping
  if (method === 'ping') {
    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  // 3. tools/list
  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  // 4. tools/call
  if (method === 'tools/call') {
    const params = rpcBody.params || {};
    const toolName = params.name;
    const args = params.arguments || {};

    if (!toolName) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [{ type: 'text', text: 'Missing tool name in tools/call request.' }],
        },
      };
    }

    // Tool: get_threejs_skills (does not strictly require a session token)
    if (toolName === 'get_threejs_skills') {
      const topic = typeof args.topic === 'string' ? args.topic.trim() : '';
      if (topic) {
        const { skills } = getRelevantSkills(topic);
        const text = skills
          .map(
            (s) =>
              `### ${s.name} (${s.id})\n**Category:** ${s.category}\n**Description:** ${s.description}\n\n${s.keyDirectives}`
          )
          .join('\n\n---\n\n');

        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Found ${skills.length} matching Three.js skill modules for query "${topic}":\n\n${text}`,
              },
            ],
          },
        };
      } else {
        const all = getAllSkills();
        const list = Array.from(all.values()).map(
          (s) => `- **${s.id}** (${s.name}): ${s.description} [${s.category}]`
        );
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Installed Three.js Skills Library (${all.size} modules):\n\n${list.join('\n')}\n\nCall get_threejs_skills with a specific topic (e.g. topic: "shaders" or "foliage") to read exact directives and code recipes.`,
              },
            ],
          },
        };
      }
    }

    // All viewport/session tools require a valid session token
    if (!sessionToken) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Session token is required to connect to a viewport. Append ?token=<your-session-token> to the MCP URL (e.g. ${host}/mcp?token=example-session) and enter the exact same token in the threejs-asset-generator web app.`,
            },
          ],
        },
      };
    }

    // Tool: push_3d_code
    if (toolName === 'push_3d_code') {
      const code = args.code;
      const title = args.title || 'Procedural 3D Model';

      if (!code || typeof code !== 'string' || !code.trim()) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            isError: true,
            content: [{ type: 'text', text: 'Error: code parameter is required and must be a non-empty string.' }],
          },
        };
      }

      await sessionStore.saveCode(sessionToken, code, title);

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Successfully pushed 3D code to session "${sessionToken}". The live browser viewport at ${host} is compiling and rendering the model in real time. Call "get_viewport_screenshot" after a moment to visually inspect the render.`,
            },
          ],
        },
      };
    }

    // Tool: get_viewport_screenshot
    if (toolName === 'get_viewport_screenshot') {
      const session = await sessionStore.getSession(sessionToken);

      if (!session || !session.latestRender) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `No viewport screenshot available yet for session "${sessionToken}".\n\nEnsure that threejs-asset-generator is open in a browser tab at ${host} with session token "${sessionToken}" active. Once open, the browser automatically uploads WebGL renders back to this MCP session.`,
              },
            ],
          },
        };
      }

      const renderUrl = session.latestRender;
      const base64Data = renderUrl.replace(/^data:image\/\w+;base64,/, '');

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'image',
              data: base64Data,
              mimeType: 'image/png',
            },
            {
              type: 'text',
              text: `Live WebGL viewport screenshot from session "${sessionToken}" (captured: ${new Date(session.updatedAt).toISOString()}).`,
            },
          ],
        },
      };
    }

    // Tool: get_current_code
    if (toolName === 'get_current_code') {
      const session = await sessionStore.getSession(sessionToken);
      const code = session?.code || '';

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: code
                ? `Current Three.js code for session "${sessionToken}":\n\n\`\`\`typescript\n${code}\n\`\`\``
                : `Session "${sessionToken}" currently has no 3D code loaded. Use "push_3d_code" to deploy a model.`,
            },
          ],
        },
      };
    }

    // Tool: clear_viewport
    if (toolName === 'clear_viewport') {
      await sessionStore.clearSession(sessionToken);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: `Session "${sessionToken}" viewport has been cleared.`,
            },
          ],
        },
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool name: "${toolName}". Use tools/list to see available tools.` }],
      },
    };
  }

  // 5. resources/list & prompts/list fallbacks
  if (method === 'resources/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { resources: [] },
    };
  }

  if (method === 'prompts/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { prompts: [] },
    };
  }

  // Unknown method
  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: "${method}"` },
  };
}

/**
 * Shared Node/Express/Vercel HTTP Request Handler for /mcp (Pure HTTPS JSON-RPC, NO SSE).
 */
export async function expressMcpHandler(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-session-token, Mcp-Session-Id, MCP-Protocol-Version');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const sessionToken = extractSessionToken(req);
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const rawHost =
    (req.headers['x-forwarded-host'] as string) ||
    (typeof req.get === 'function' ? req.get('host') : undefined) ||
    (typeof req.headers.host === 'string' ? req.headers.host : undefined) ||
    'threejs-asset-generator.vercel.app';
  const host = `${proto}://${rawHost}`;

  // GET /mcp:
  // Per MCP Streamable HTTP spec, if a client explicitly requests an SSE stream (text/event-stream),
  // respond with 405 Method Not Allowed to cleanly signal HTTPS JSON-RPC only (no SSE).
  // Otherwise return human/machine-readable JSON server status.
  if (req.method === 'GET') {
    const accept = String(req.headers.accept || '');
    if (accept.includes('text/event-stream') && !accept.includes('text/html') && !accept.includes('*/*')) {
      return res.status(405).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'SSE streaming is disabled on this server. Use HTTP POST JSON-RPC 2.0 requests.',
        },
        id: null,
      });
    }

    const session = sessionToken ? await sessionStore.getSession(sessionToken) : null;
    const displayToken = sessionToken || 'example-session';

    return res.status(200).json({
      name: 'threejs-asset-generator',
      description: 'Stateless HTTPS JSON-RPC Model Context Protocol (MCP) Server for Three.js 3D Asset Generation',
      version: '1.0.0',
      status: 'online',
      transport: 'streamable-http-json',
      sseEnabled: false,
      storageBackend: sessionStore.getBackendType(),
      sessionToken: sessionToken || null,
      sessionState: sessionToken
        ? {
            hasCode: Boolean(session?.code),
            hasRenderScreenshot: Boolean(session?.latestRender),
            updatedAt: session?.updatedAt || null,
          }
        : null,
      availableTools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
      connectionGuide: {
        mcpEndpoint: `${host}/mcp?token=${displayToken}`,
        mcpConfig: {
          mcpServers: {
            'threejs-asset-generator': {
              url: `${host}/mcp?token=${displayToken}`,
            },
          },
        },
      },
    });
  }

  // POST /mcp: Stateless HTTPS JSON-RPC 2.0 execution (supports single message or JSON-RPC batch)
  if (req.method === 'POST') {
    try {
      const body = req.body;

      if (Array.isArray(body)) {
        const results = (
          await Promise.all(body.map((msg) => handleMcpRpcMessage(msg, sessionToken, host)))
        ).filter((r) => r !== null);

        if (results.length === 0) {
          return res.status(202).end();
        }
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(results);
      }

      const responseBody = await handleMcpRpcMessage(body, sessionToken, host);
      if (responseBody === null) {
        return res.status(202).end();
      }

      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json(responseBody);
    } catch (err: any) {
      console.error('[mcp] Error handling RPC request:', err);
      return res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: { code: -32603, message: err.message || 'Internal server error' },
      });
    }
  }

  return res.status(405).json({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32000, message: 'Method Not Allowed. Use POST for JSON-RPC 2.0 over HTTPS.' },
  });
}
