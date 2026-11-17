import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { app } from './app.js';
import { sessionStore } from './sessionStore.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3001;

// Serve built frontend if dist/client exists (production or self-hosted run)
const clientDist = path.join(__dirname, '../client');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/mcp')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`[threejs-asset-generator] Server running at http://localhost:${PORT}`);
  console.log(`[threejs-asset-generator] MCP Endpoint (HTTPS JSON-RPC, No-SSE): http://localhost:${PORT}/mcp?token=example-session`);
  console.log(`[threejs-asset-generator] Agent Webhook: http://localhost:${PORT}/api/sessions/:id/code`);
  console.log(`[threejs-asset-generator] Storage Backend: ${sessionStore.getBackendType()}`);
});
