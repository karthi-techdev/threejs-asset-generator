export interface SessionState {
  id: string;
  code: string;
  title: string;
  updatedAt: number;
  latestRender?: string;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24 hours

/**
 * Sanitizes and validates a session token from query params or headers.
 */
export function sanitizeSessionToken(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 128);
}

/**
 * Pluggable session store supporting Upstash Redis / Vercel KV via REST API
 * for stateless serverless deployments (Vercel), with automatic fallback to
 * in-memory storage for local development and single-instance hosting.
 */
export class SessionStore {
  private memoryMap = new Map<string, SessionState>();

  private getRedisConfig(): { url: string; token: string } | null {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) {
      return { url: url.replace(/\/+$/, ''), token };
    }
    return null;
  }

  public getBackendType(): 'redis' | 'memory' {
    return this.getRedisConfig() ? 'redis' : 'memory';
  }

  private async redisCommand<T = unknown>(command: (string | number)[]): Promise<T | null> {
    const cfg = this.getRedisConfig();
    if (!cfg) return null;

    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!res.ok) {
      throw new Error(`Redis REST error (${res.status})`);
    }

    const data = (await res.json()) as { result?: T; error?: string };
    if (data.error) {
      throw new Error(`Redis command error: ${data.error}`);
    }
    return data.result ?? null;
  }

  public async getSession(rawToken: string): Promise<SessionState | null> {
    const id = sanitizeSessionToken(rawToken);
    if (!id) return null;

    if (this.getRedisConfig()) {
      try {
        const raw = await this.redisCommand<string>(['GET', `threejs:session:${id}`]);
        if (raw) {
          const parsed = JSON.parse(raw) as SessionState;
          this.memoryMap.set(id, parsed);
          return parsed;
        }
      } catch (err) {
        console.warn('[sessionStore] Redis GET fallback to memory:', err);
      }
    }

    return this.memoryMap.get(id) || null;
  }

  public async saveCode(rawToken: string, code: string, title?: string): Promise<SessionState> {
    const id = sanitizeSessionToken(rawToken);
    if (!id) {
      throw new Error('Invalid or empty session token.');
    }

    const existing = (await this.getSession(id)) || {
      id,
      title: title || 'Procedural 3D Asset',
      code: '',
      updatedAt: Date.now(),
    };

    const updated: SessionState = {
      ...existing,
      id,
      code,
      title: title || existing.title || 'Procedural 3D Asset',
      updatedAt: Date.now(),
    };

    this.memoryMap.set(id, updated);

    if (this.getRedisConfig()) {
      try {
        await this.redisCommand(['SET', `threejs:session:${id}`, JSON.stringify(updated), 'EX', SESSION_TTL_SECONDS]);
      } catch (err) {
        console.warn('[sessionStore] Redis SET failed:', err);
      }
    }

    return updated;
  }

  public async saveRender(rawToken: string, screenshot: string): Promise<SessionState> {
    const id = sanitizeSessionToken(rawToken);
    if (!id) {
      throw new Error('Invalid or empty session token.');
    }

    const existing = (await this.getSession(id)) || {
      id,
      title: 'Procedural 3D Asset',
      code: '',
      updatedAt: Date.now(),
    };

    const updated: SessionState = {
      ...existing,
      id,
      latestRender: screenshot,
      updatedAt: Date.now(),
    };

    this.memoryMap.set(id, updated);

    if (this.getRedisConfig()) {
      try {
        await this.redisCommand(['SET', `threejs:session:${id}`, JSON.stringify(updated), 'EX', SESSION_TTL_SECONDS]);
      } catch (err) {
        console.warn('[sessionStore] Redis SET render failed:', err);
      }
    }

    return updated;
  }

  public async clearSession(rawToken: string): Promise<void> {
    const id = sanitizeSessionToken(rawToken);
    if (!id) return;

    const cleared: SessionState = {
      id,
      title: 'Workspace',
      code: '',
      updatedAt: Date.now(),
      latestRender: undefined,
    };

    this.memoryMap.set(id, cleared);

    if (this.getRedisConfig()) {
      try {
        await this.redisCommand(['SET', `threejs:session:${id}`, JSON.stringify(cleared), 'EX', SESSION_TTL_SECONDS]);
      } catch (err) {
        console.warn('[sessionStore] Redis clear failed:', err);
      }
    }
  }
}

export const sessionStore = new SessionStore();
