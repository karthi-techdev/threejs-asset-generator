import { buildEnrichedSystemPrompt } from './skillLoader.js';

export interface GenerateRequest {
  prompt: string;
  image?: string; // base64 data URL
  provider: 'gemini' | 'claude' | 'openai' | 'ollama' | 'custom' | 'demo';
  apiKey?: string;
  model?: string;
  currentCode?: string;
  baseUrl?: string; // for custom Ollama / OpenRouter / local / proxy endpoints
}

export interface AgentResult {
  code: string;
  analysis: string;
  provider: string;
  model: string;
  tokens?: number;
  appliedSkills?: string[];
}

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
}

export interface FetchModelsRequest {
  provider: 'gemini' | 'claude' | 'openai' | 'ollama' | 'custom';
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Strips markdown code blocks and returns clean Three.js TypeScript code.
 * Handles multiple blocks (prefers the one defining createModel), unclosed fences, and bare code.
 */
export function extractCodeBlock(text: string): { code: string; analysis: string } {
  const raw = (text || '').trim();
  if (!raw) {
    return { code: '', analysis: 'Model returned an empty response.' };
  }

  // Collect all closed fenced code blocks
  const blockRegex = /```(?:typescript|javascript|tsx|jsx|ts|js)?\s*\r?\n?([\s\S]*?)```/gi;
  const blocks: { full: string; code: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(raw)) !== null) {
    const candidate = m[1].trim();
    if (candidate) {
      blocks.push({ full: m[0], code: candidate });
    }
  }

  if (blocks.length > 0) {
    // Prefer the block defining createModel (or the longest code block)
    const best =
      blocks.find((b) => /\bcreateModel\b/.test(b.code)) ||
      blocks.reduce((a, b) => (b.code.length > a.code.length ? b : a));
    const analysis = raw.replace(best.full, '').trim();
    return { code: best.code, analysis };
  }

  // Handle an unclosed opening markdown fence (e.g. truncated response)
  const unclosedMatch = raw.match(/```(?:typescript|javascript|tsx|jsx|ts|js)?\s*\r?\n?([\s\S]+)$/i);
  if (unclosedMatch) {
    const code = unclosedMatch[1].trim();
    const analysis = raw.slice(0, unclosedMatch.index).trim();
    return { code, analysis: analysis || 'Code extracted from response.' };
  }

  // Bare code output without fences
  if (/\b(export\s+)?function\s+createModel\b/.test(raw) || /\bTHREE\.\w+/.test(raw)) {
    return { code: raw, analysis: 'Direct code output.' };
  }

  return { code: '', analysis: raw };
}

/**
 * Google Gemini Provider
 */
async function callGemini(req: GenerateRequest): Promise<AgentResult> {
  const apiKey = req.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing Gemini API Key. Provide it in the UI or set GEMINI_API_KEY env var.');

  const model = req.model || 'gemini-1.5-flash';
  const baseUrl = (req.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const { prompt: systemPrompt, appliedSkills } = buildEnrichedSystemPrompt(req.prompt, Boolean(req.image));
  const parts: any[] = [{ text: systemPrompt }];

  if (req.currentCode) {
    parts.push({ text: `Current code to refine:\n\`\`\`typescript\n${req.currentCode}\n\`\`\`` });
  }

  if (req.image) {
    const mimeMatch = req.image.match(/^data:([^;]+);base64,(.+)$/);
    if (mimeMatch) {
      parts.push({
        inline_data: {
          mime_type: mimeMatch[1],
          data: mimeMatch[2],
        },
      });
    }
  }

  parts.push({ text: `User Request: ${req.prompt || 'Reconstruct this object as a procedural Three.js model.'}` });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts }] }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const { code, analysis } = extractCodeBlock(textOutput);

  return { code, analysis, provider: 'gemini', model, appliedSkills };
}

/**
 * Anthropic Claude Provider
 */
async function callClaude(req: GenerateRequest): Promise<AgentResult> {
  const apiKey = req.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing Anthropic API Key. Provide it in the UI or set ANTHROPIC_API_KEY env var.');

  const model = req.model || 'claude-3-5-sonnet-20241022';
  const baseUrl = (req.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1/messages`;

  const { prompt: systemPrompt, appliedSkills } = buildEnrichedSystemPrompt(req.prompt, Boolean(req.image));

  const content: any[] = [];

  if (req.image) {
    const mimeMatch = req.image.match(/^data:([^;]+);base64,(.+)$/);
    if (mimeMatch) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeMatch[1],
          data: mimeMatch[2],
        },
      });
    }
  }

  let promptText = req.prompt || 'Reconstruct this object as a procedural Three.js model.';
  if (req.currentCode) {
    promptText += `\n\nRefine this existing code:\n\`\`\`typescript\n${req.currentCode}\n\`\`\``;
  }
  content.push({ type: 'text', text: promptText });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const textOutput = data.content?.[0]?.text || '';
  const { code, analysis } = extractCodeBlock(textOutput);

  return { code, analysis, provider: 'claude', model, appliedSkills };
}

/**
 * OpenAI / Ollama / Custom Compatible Provider
 */
async function callOpenAICompatible(req: GenerateRequest, providerType: string = 'openai'): Promise<AgentResult> {
  const isOllama = providerType === 'ollama';
  const isCustom = providerType === 'custom';

  let defaultBase = 'https://api.openai.com/v1';
  if (isOllama) defaultBase = 'http://localhost:11434/v1';
  if (isCustom) defaultBase = 'https://openrouter.ai/api/v1';

  let baseUrl = (req.baseUrl || defaultBase).replace(/\/+$/, '');
  if (baseUrl === 'https://api.openai.com') baseUrl = 'https://api.openai.com/v1';

  const apiKey = req.apiKey || (isOllama ? 'ollama' : (isCustom ? process.env.CUSTOM_API_KEY : process.env.OPENAI_API_KEY));
  if (!apiKey && !isOllama) {
    throw new Error(`Missing API Key for ${providerType}. Provide it in the UI or in your environment variables.`);
  }

  const model = req.model || (isOllama ? 'llama3.2-vision' : (isCustom ? 'anthropic/claude-3.5-sonnet' : 'gpt-4o'));
  const url = `${baseUrl}/chat/completions`;

  const userContent: any[] = [];

  if (req.image) {
    userContent.push({
      type: 'image_url',
      image_url: { url: req.image },
    });
  }

  let promptText = req.prompt || 'Reconstruct this object as a procedural Three.js model.';
  if (req.currentCode) {
    promptText += `\n\nRefine this existing code:\n\`\`\`typescript\n${req.currentCode}\n\`\`\``;
  }
  userContent.push({ type: 'text', text: promptText });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const { prompt: systemPrompt, appliedSkills } = buildEnrichedSystemPrompt(req.prompt, Boolean(req.image));

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();

    // Auto-fallback: If model rejects image payload (e.g. text/code-only models like poolside/legume-xs-2.1 or Groq)
    if (req.image && (errText.includes('multimodal') || errText.includes('image_url') || errText.includes('does not support image') || errText.includes('400'))) {
      console.warn(`[agents] Model ${model} rejected multimodal payload (${errText.slice(0, 100)}). Retrying automatically in text-only mode...`);

      const textOnlyContent = [{ type: 'text', text: promptText }];
      const fallbackRes = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: textOnlyContent },
          ],
          temperature: 0.2,
        }),
      });

      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json();
        const fallbackMsg = fallbackData.choices?.[0]?.message;
        const textOutput =
          (typeof fallbackMsg?.content === 'string' && fallbackMsg.content.trim()
            ? fallbackMsg.content
            : fallbackMsg?.reasoning_content || fallbackMsg?.reasoning || '') || '';
        const { code, analysis } = extractCodeBlock(textOutput);
        return {
          code,
          analysis: `[Notice: ${model} is a text/code model that does not process images directly. Model was generated from your prompt and Three.js skills.]\n\n${analysis}`,
          provider: providerType,
          model,
          appliedSkills,
        };
      }
    }

    throw new Error(`${providerType.toUpperCase()} API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;
  const textOutput =
    (typeof msg?.content === 'string' && msg.content.trim()
      ? msg.content
      : msg?.reasoning_content || msg?.reasoning || '') || '';
  const { code, analysis } = extractCodeBlock(textOutput);

  return { code, analysis, provider: providerType, model, appliedSkills };
}

/**
 * Fetch available models from Gemini
 */
async function fetchGeminiModels(req: FetchModelsRequest): Promise<ModelInfo[]> {
  const apiKey = req.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing Gemini API Key. Please enter your API Key.');

  const baseUrl = (req.baseUrl || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1beta/models?key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawList = data.models || [];
  return rawList
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => ({
      id: m.name.replace(/^models\//, ''),
      name: m.displayName || m.name.replace(/^models\//, ''),
      description: m.description || '',
    }));
}

/**
 * Fetch available models from Claude
 */
async function fetchClaudeModels(req: FetchModelsRequest): Promise<ModelInfo[]> {
  const apiKey = req.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Missing Anthropic API Key. Please enter your API Key.');

  const baseUrl = (req.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = `${baseUrl}/v1/models`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.data) && data.data.length > 0) {
        return data.data.map((m: any) => ({
          id: m.id,
          name: m.display_name || m.id,
          description: m.type || 'Anthropic Model',
        }));
      }
    }
  } catch (e) {
    // Anthropic models endpoint fallback
  }

  return [
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (Latest)', description: 'Best for complex coding and vision' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast and responsive' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', description: 'Deep reasoning' },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', description: 'Balanced model' },
    { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', description: 'Lightweight model' },
  ];
}

/**
 * Fetch available models from OpenAI / Custom OpenAI-compatible endpoint
 */
async function fetchOpenAIModels(req: FetchModelsRequest, providerName: string): Promise<ModelInfo[]> {
  const isOllama = providerName === 'ollama';
  const isCustom = providerName === 'custom';
  const apiKey = req.apiKey || (isOllama ? 'ollama' : (isCustom ? process.env.CUSTOM_API_KEY : process.env.OPENAI_API_KEY));

  let defaultBase = 'https://api.openai.com/v1';
  if (isOllama) defaultBase = 'http://localhost:11434/v1';
  if (isCustom) defaultBase = 'https://openrouter.ai/api/v1';

  let baseUrl = (req.baseUrl || defaultBase).replace(/\/+$/, '');
  if (baseUrl === 'https://api.openai.com') baseUrl = 'https://api.openai.com/v1';

  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${providerName.toUpperCase()} Error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawList = data.data || data.models || [];
  if (!Array.isArray(rawList)) {
    throw new Error('Unexpected models response format: missing data or models array.');
  }

  return rawList.map((m: any) => {
    const id = typeof m === 'string' ? m : m.id || m.name;
    let name = typeof m === 'string' ? m : m.name || m.id;
    const lower = id.toLowerCase();
    const isVision = lower.includes('vision') || lower.includes('vl') || lower.includes('4o') || lower.includes('neva') || lower.includes('phi-3-vision') || lower.includes('phi-3.5-vision') || lower.includes('llava') || lower.includes('deplot') || lower.includes('kosmos');
    if (isVision) {
      name = `${name} (Vision)`;
    }
    const desc = m.description || (m.owned_by ? `Owner: ${m.owned_by}` : '');
    return { id, name, description: desc };
  });
}

/**
 * Fetch available models from Ollama
 */
async function fetchOllamaModels(req: FetchModelsRequest): Promise<ModelInfo[]> {
  let baseUrl = (req.baseUrl || 'http://localhost:11434').replace(/\/+$/, '');
  if (baseUrl.endsWith('/v1')) {
    baseUrl = baseUrl.substring(0, baseUrl.length - 3);
  }

  // 1. Try Ollama native /api/tags
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.models)) {
        return data.models.map((m: any) => ({
          id: m.name,
          name: m.name,
          description: m.details?.parameter_size ? `${m.details.parameter_size} • ${m.details.family || ''}` : 'Local model',
        }));
      }
    }
  } catch (e) {
    // fallback
  }

  // 2. Try OpenAI compatible /v1/models
  return fetchOpenAIModels({ ...req, baseUrl: `${baseUrl}/v1` }, 'ollama');
}

/**
 * Master Model Fetcher
 */
export async function fetchAvailableModels(req: FetchModelsRequest): Promise<ModelInfo[]> {
  switch (req.provider) {
    case 'gemini':
      return fetchGeminiModels(req);
    case 'claude':
      return fetchClaudeModels(req);
    case 'openai':
      return fetchOpenAIModels(req, 'openai');
    case 'ollama':
      return fetchOllamaModels(req);
    case 'custom':
      return fetchOpenAIModels(req, 'custom');
    default:
      throw new Error(`Unsupported provider: ${req.provider}`);
  }
}

/**
 * Main Multi-Agent Router
 */
export async function runAgentOrchestrator(req: GenerateRequest): Promise<AgentResult> {
  switch (req.provider) {
    case 'gemini':
      return callGemini(req);
    case 'claude':
      return callClaude(req);
    case 'openai':
      return callOpenAICompatible(req, 'openai');
    case 'ollama':
      return callOpenAICompatible(req, 'ollama');
    case 'custom':
      return callOpenAICompatible(req, 'custom');
    default:
      throw new Error(`Unsupported AI agent provider: ${req.provider}`);
  }
}
