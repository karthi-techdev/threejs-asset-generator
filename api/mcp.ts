import type { Request, Response } from 'express';
import { expressMcpHandler } from '../server/mcpHandler.js';

export default async function handler(req: Request, res: Response) {
  if (typeof req.body === 'string' && req.body.trim().length > 0) {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // leave as-is for JSON-RPC error handling
    }
  }
  return expressMcpHandler(req, res);
}
