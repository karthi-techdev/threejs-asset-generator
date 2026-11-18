import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Code2, 
  Terminal, 
  Upload, 
  Play, 
  RefreshCw, 
  Cpu, 
  Bot, 
  Key, 
  KeyRound,
  Check, 
  Copy,
  AlertCircle, 
  Globe, 
  Eye, 
  EyeOff, 
  Sliders, 
  Server,
  FileCode,
  BookOpen,
  ChevronRight,
  Shuffle,
  Link2,
  Radio,
  X,
  Film,
  Plus
} from 'lucide-react';
import { formatAnimationLabel } from './Viewport3D';

interface AgentPanelProps {
  code: string;
  onCodeChange: (newCode: string) => void;
  sessionId: string;
  onSessionIdChange: (newToken: string) => void;
  activeTab: 'agent' | 'editor' | 'api';
  onTabChange: (tab: 'agent' | 'editor' | 'api') => void;
  codeError: string | null;
  availableAnimations?: string[];
  activeAnimation?: string | null;
  onSelectAnimation?: (name: string) => void;
}

export type ProviderType = 'gemini' | 'claude' | 'openai' | 'ollama' | 'custom';

interface ModelOption {
  id: string;
  name: string;
  description?: string;
}

interface InstalledSkill {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface UploadedReferenceImage {
  id: string;
  name: string;
  dataUrl: string;
}

const MAX_REFERENCE_IMAGES = 6;

const PROVIDER_METADATA: Record<ProviderType, { label: string; urlPlaceholder: string; keyPlaceholder: string; defaultEndpoint: string }> = {
  gemini: {
    label: 'Google Gemini',
    urlPlaceholder: 'https://generativelanguage.googleapis.com',
    keyPlaceholder: 'Enter Gemini API key',
    defaultEndpoint: 'https://generativelanguage.googleapis.com',
  },
  claude: {
    label: 'Anthropic Claude',
    urlPlaceholder: 'https://api.anthropic.com',
    keyPlaceholder: 'Enter Claude API key (sk-ant-...)',
    defaultEndpoint: 'https://api.anthropic.com',
  },
  openai: {
    label: 'OpenAI',
    urlPlaceholder: 'https://api.openai.com/v1',
    keyPlaceholder: 'Enter OpenAI API key (sk-...)',
    defaultEndpoint: 'https://api.openai.com/v1',
  },
  ollama: {
    label: 'Local Ollama',
    urlPlaceholder: 'http://localhost:11434',
    keyPlaceholder: 'Optional for local (or custom token)',
    defaultEndpoint: 'http://localhost:11434',
  },
  custom: {
    label: 'Custom API',
    urlPlaceholder: 'https://openrouter.ai/api/v1 (or your proxy URL)',
    keyPlaceholder: 'Enter API key for custom endpoint',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
  },
};

export const AgentPanel: React.FC<AgentPanelProps> = ({
  code,
  onCodeChange,
  sessionId,
  onSessionIdChange,
  activeTab,
  onTabChange,
  codeError,
  availableAnimations = [],
  activeAnimation = null,
  onSelectAnimation,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const lastRemoteUpdatedAtRef = useRef<number>(0);

  // Provider State - restored from localStorage
  const [provider, setProvider] = useState<ProviderType>(() => {
    return (localStorage.getItem('storage_provider') as ProviderType) || 'gemini';
  });

  // API Key & URL - strictly from localStorage, no hardcoded defaults
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [showCustomUrl, setShowCustomUrl] = useState(false);

  // Model State - strictly from localStorage, no hardcoded defaults
  const [model, setModel] = useState<string>('');
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelsFetchError, setModelsFetchError] = useState<string | null>(null);
  const [modelsFetchSuccess, setModelsFetchSuccess] = useState<string | null>(null);
  const [manualModelMode, setManualModelMode] = useState(false);

  // Skills Engine State
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [usedSkills, setUsedSkills] = useState<string[]>([]);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillCategory, setSkillCategory] = useState<string>('All');
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);

  // Generator Execution State - no prefilled text
  const [prompt, setPrompt] = useState('');
  const [referenceImages, setReferenceImages] = useState<UploadedReferenceImage[]>([]);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [sendImageToModel, setSendImageToModel] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [agentAnalysis, setAgentAnalysis] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStage, setCurrentStage] = useState<string | null>(null);

  // Code Editor State
  const [editorText, setEditorText] = useState(code);

  // Webhook / API auto-poll state
  const [autoPoll, setAutoPoll] = useState(true);

  const loadInstalledSkills = async (forceRefresh: boolean = false) => {
    setIsLoadingSkills(true);
    try {
      const res = await fetch(forceRefresh ? '/api/skills?refresh=1' : '/api/skills', {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.skills)) {
          setInstalledSkills(data.skills);
        }
      }
    } catch {
      // ignore skills fetch errors
    } finally {
      setIsLoadingSkills(false);
    }
  };

  // Load Installed Skills from Backend on Mount
  useEffect(() => {
    loadInstalledSkills(false);
  }, []);

  // Load Provider Settings whenever provider changes
  useEffect(() => {
    localStorage.setItem('storage_provider', provider);
    const savedKey = localStorage.getItem(`storage_api_key_${provider}`) || '';
    const savedUrl = localStorage.getItem(`storage_base_url_${provider}`) || '';
    const savedModel = localStorage.getItem(`storage_model_${provider}`) || '';

    setApiKey(savedKey);
    setBaseUrl(savedUrl);
    setModel(savedModel);
    setAvailableModels([]);
    setModelsFetchError(null);
    setModelsFetchSuccess(null);
  }, [provider]);

  const codeRef = useRef<string>(code);
  const onCodeChangeRef = useRef(onCodeChange);

  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  useEffect(() => {
    onCodeChangeRef.current = onCodeChange;
  }, [onCodeChange]);

  // Sync locally generated or edited code back to the active MCP session so polling
  // and render uploads never overwrite local work with an older/empty session state.
  const syncLocalCodeToSession = async (newCode: string, title?: string) => {
    const cleanToken = sessionId.trim();
    if (!cleanToken) return;
    const optimisticTs = Date.now();
    if (optimisticTs > lastRemoteUpdatedAtRef.current) {
      lastRemoteUpdatedAtRef.current = optimisticTs;
    }
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(cleanToken)}/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newCode, title: title || 'Procedural 3D Asset' }),
      });
      if (res.ok) {
        const data = await res.json();
        const savedTs = Number(data.session?.codeUpdatedAt || data.session?.updatedAt || 0);
        if (savedTs > lastRemoteUpdatedAtRef.current) {
          lastRemoteUpdatedAtRef.current = savedTs;
        }
      }
    } catch {
      // ignore session sync errors
    }
  };

  // Sync editorText when code changes externally
  useEffect(() => {
    setEditorText(code);
  }, [code]);

  // Reset last remote sync marker when session token changes
  useEffect(() => {
    lastRemoteUpdatedAtRef.current = 0;
  }, [sessionId]);

  // Auto-poll external MCP / coding agent updates for the active session token
  useEffect(() => {
    const cleanToken = sessionId.trim();
    if (!autoPoll || !cleanToken) return;

    const pollSession = async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(cleanToken)}/code`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json();
          const remote = data.session;
          if (remote && typeof remote.code === 'string') {
            // Only treat remote as a code update when codeUpdatedAt advanced
            // (screenshot uploads bump updatedAt but NOT codeUpdatedAt).
            const remoteCodeUpdatedAt =
              typeof remote.codeUpdatedAt === 'number'
                ? remote.codeUpdatedAt
                : remote.code.trim().length > 0
                  ? Number(remote.updatedAt || 0)
                  : 0;

            if (remoteCodeUpdatedAt > lastRemoteUpdatedAtRef.current && remote.code !== codeRef.current) {
              lastRemoteUpdatedAtRef.current = remoteCodeUpdatedAt;
              onCodeChangeRef.current(remote.code);
            }
          }
        }
      } catch {
        // ignore network poll errors
      }
    };

    pollSession();
    const interval = setInterval(pollSession, 2000);
    return () => clearInterval(interval);
  }, [autoPoll, sessionId]);

  const handleCopyText = async (field: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => {
        setCopiedField((prev) => (prev === field ? null : prev));
      }, 1800);
    } catch {
      // clipboard fallback ignored
    }
  };

  const handleGenerateToken = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let suffix = '';
    for (let i = 0; i < 8; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    onSessionIdChange(`session-${suffix}`);
  };

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    localStorage.setItem(`storage_api_key_${provider}`, key);
  };

  const handleBaseUrlChange = (url: string) => {
    setBaseUrl(url);
    localStorage.setItem(`storage_base_url_${provider}`, url);
  };

  const handleModelChange = (selectedModel: string) => {
    setModel(selectedModel);
    localStorage.setItem(`storage_model_${provider}`, selectedModel);
  };

  // Fetch available models dynamically from provider endpoint
  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setModelsFetchError(null);
    setModelsFetchSuccess(null);

    try {
      const activeUrl = baseUrl.trim() || PROVIDER_METADATA[provider].defaultEndpoint;
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          apiKey: apiKey.trim() || undefined,
          baseUrl: activeUrl || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch models from API.');
      }

      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        setAvailableModels(data.models);
        setModelsFetchSuccess(`${data.models.length} models found`);
        
        // Auto-select if current model is empty or not in fetched list
        const exists = data.models.some((m: ModelOption) => m.id === model);
        if (!exists && data.models[0]?.id) {
          handleModelChange(data.models[0].id);
        }
      } else {
        throw new Error('No models returned from API.');
      }
    } catch (err: any) {
      console.error('Fetch models error:', err);
      setModelsFetchError(err.message || 'Unable to fetch models');
    } finally {
      setIsFetchingModels(false);
    }
  };

  const readAndOptimizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
      reader.onload = (event) => {
        const rawDataUrl = event.target?.result as string;
        if (!rawDataUrl) {
          reject(new Error(`Empty file: ${file.name}`));
          return;
        }

        // Downscale oversized images so multi-image uploads stay cleanly within serverless body limits
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          const needsResize = img.width > maxDim || img.height > maxDim || rawDataUrl.length > 650_000;
          if (!needsResize) {
            resolve(rawDataUrl);
            return;
          }
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(rawDataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const outputMime = file.type === 'image/png' ? 'image/webp' : 'image/jpeg';
          const optimized = canvas.toDataURL(outputMime, 0.85);
          resolve(optimized.length < rawDataUrl.length ? optimized : rawDataUrl);
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  const addImageFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const remainingSlots = Math.max(0, MAX_REFERENCE_IMAGES - referenceImages.length);
    if (remainingSlots === 0) {
      setErrorMessage(`Maximum ${MAX_REFERENCE_IMAGES} reference images allowed.`);
      return;
    }

    const toProcess = files.slice(0, remainingSlots);
    try {
      const loaded = await Promise.all(
        toProcess.map(async (file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          dataUrl: await readAndOptimizeImage(file),
        }))
      );
      setReferenceImages((prev) => [...prev, ...loaded].slice(0, MAX_REFERENCE_IMAGES));
      if (files.length > remainingSlots) {
        setErrorMessage(`Added ${loaded.length} image(s). Maximum ${MAX_REFERENCE_IMAGES} images allowed.`);
      } else {
        setErrorMessage(null);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to read selected image(s).');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await addImageFiles(e.target.files);
    }
    // Reset input value so the same file can be re-selected if removed
    e.target.value = '';
  };

  const handleImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingImages(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await addImageFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveImage = (id: string) => {
    setReferenceImages((prev) => prev.filter((img) => img.id !== id));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && referenceImages.length === 0) {
      setErrorMessage('Please provide a prompt or at least one reference image.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setAgentAnalysis(null);
    setCurrentStage('Selecting matching Three.js skills...');

    try {
      const stageTimer1 = setTimeout(() => setCurrentStage('Applying threejs-geometry & buffer math...'), 1800);
      const stageTimer2 = setTimeout(() => setCurrentStage('Writing threejs-materials & procedural canvas shaders...'), 3800);
      const stageTimer3 = setTimeout(() => setCurrentStage('Wiring threejs-animation loop and quality gates...'), 6000);

      const activeUrl = baseUrl.trim() || PROVIDER_METADATA[provider].defaultEndpoint;
      const imagePayload =
        sendImageToModel && referenceImages.length > 0
          ? referenceImages.map((img) => img.dataUrl)
          : undefined;
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          image: imagePayload?.[0],
          images: imagePayload,
          provider,
          model: model.trim() || undefined,
          apiKey: apiKey.trim() || undefined,
          baseUrl: activeUrl || undefined,
          currentCode: code,
        }),
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Generation failed.');
      }

      const data = await res.json();
      setUsedSkills(data.appliedSkills || []);
      setCurrentStage(null);

      if (typeof data.code === 'string' && data.code.trim()) {
        onCodeChange(data.code);
        setEditorText(data.code);
        setAgentAnalysis(data.analysis || 'Model generated successfully.');
        syncLocalCodeToSession(data.code, prompt.trim().slice(0, 60) || 'Procedural 3D Model');
      } else {
        setAgentAnalysis(data.analysis || null);
        setErrorMessage(
          'The model responded without executable Three.js code. Check Sculpt Notes or retry with a clearer prompt.'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Generation error');
      setCurrentStage(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-neutral-950 border-l border-neutral-200 dark:border-neutral-800 text-neutral-800 dark:text-neutral-200 overflow-hidden font-sans transition-colors">
      {/* Top Tabs - Flat, Simple, Elegant */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 text-xs font-medium transition-colors">
        <button
          onClick={() => onTabChange('agent')}
          className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-1.5 border-b transition-colors ${
            activeTab === 'agent'
              ? 'border-neutral-950 text-neutral-950 bg-neutral-100/70 dark:border-white dark:text-white dark:bg-neutral-900/40 font-medium'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>AI Generator</span>
        </button>

        <button
          onClick={() => onTabChange('editor')}
          className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-1.5 border-b transition-colors ${
            activeTab === 'editor'
              ? 'border-neutral-950 text-neutral-950 bg-neutral-100/70 dark:border-white dark:text-white dark:bg-neutral-900/40 font-medium'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Code2 className="w-3.5 h-3.5" />
          <span>Code Editor</span>
        </button>

        <button
          onClick={() => onTabChange('api')}
          className={`flex-1 py-2.5 px-3 flex items-center justify-center space-x-1.5 border-b transition-colors ${
            activeTab === 'api'
              ? 'border-neutral-950 text-neutral-950 bg-neutral-100/70 dark:border-white dark:text-white dark:bg-neutral-900/40 font-medium'
              : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>MCP Server</span>
        </button>
      </div>

      {/* Tab Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ============================================================== */}
        {/* TAB 1: AI GENERATOR */}
        {/* ============================================================== */}
        {activeTab === 'agent' && (
          <div className="space-y-4 text-xs">
            {/* 1. Provider Selector */}
            <div className="space-y-1.5">
              <label className="text-neutral-600 dark:text-neutral-400 font-medium text-[11px] block">
                Provider
              </label>

              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setProvider('gemini')}
                  className={`p-2 rounded-md border flex flex-col items-start transition-colors ${
                    provider === 'gemini'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-400 dark:bg-neutral-800 dark:text-white font-medium'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <Sparkles className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                    <span className="text-xs">Gemini</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Google AI</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('claude')}
                  className={`p-2 rounded-md border flex flex-col items-start transition-colors ${
                    provider === 'claude'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-400 dark:bg-neutral-800 dark:text-white font-medium'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <Cpu className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                    <span className="text-xs">Claude</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">Anthropic</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('openai')}
                  className={`p-2 rounded-md border flex flex-col items-start transition-colors ${
                    provider === 'openai'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-400 dark:bg-neutral-800 dark:text-white font-medium'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <div className="flex items-center space-x-1.5 mb-0.5">
                    <Bot className="w-3 h-3 text-neutral-600 dark:text-neutral-300" />
                    <span className="text-xs">OpenAI</span>
                  </div>
                  <span className="text-[10px] text-neutral-500">GPT-4o</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setProvider('ollama')}
                  className={`p-2 rounded-md border flex items-center space-x-2 transition-colors ${
                    provider === 'ollama'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-400 dark:bg-neutral-800 dark:text-white font-medium'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <Server className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
                  <div className="text-left">
                    <div className="text-xs">Ollama</div>
                    <div className="text-[10px] text-neutral-500">Self-Hosted</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('custom')}
                  className={`p-2 rounded-md border flex items-center space-x-2 transition-colors ${
                    provider === 'custom'
                      ? 'border-neutral-900 bg-neutral-100 text-neutral-950 dark:border-neutral-400 dark:bg-neutral-800 dark:text-white font-medium'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-300'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
                  <div className="text-left">
                    <div className="text-xs">Custom API</div>
                    <div className="text-[10px] text-neutral-500">OpenAI Compatible</div>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. API Configuration (Key, URL, Model) */}
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-3 transition-colors">
              {/* API Key */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-700 dark:text-neutral-300 text-[11px] font-medium flex items-center space-x-1.5">
                    <Key className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                    <span>API Key</span>
                  </label>
                  {apiKey && (
                    <span className="text-[10px] text-neutral-500">Saved in storage</span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    placeholder={PROVIDER_METADATA[provider].keyPlaceholder}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md pl-2.5 pr-8 py-1.5 text-xs text-neutral-950 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 font-mono transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-2 text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors"
                    title={showApiKey ? 'Hide Key' : 'Show Key'}
                  >
                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Base URL (Optional / Configurable) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowCustomUrl(!showCustomUrl)}
                    className="text-[11px] text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white flex items-center space-x-1 font-medium transition-colors"
                  >
                    <Globe className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                    <span>API URL</span>
                    <span className="text-[10px] text-neutral-500">
                      ({showCustomUrl || provider === 'custom' || provider === 'ollama' ? 'custom' : 'default'})
                    </span>
                  </button>
                  {baseUrl && (
                    <button
                      type="button"
                      onClick={() => handleBaseUrlChange('')}
                      className="text-[10px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {(showCustomUrl || provider === 'custom' || provider === 'ollama') && (
                  <input
                    type="text"
                    placeholder={PROVIDER_METADATA[provider].urlPlaceholder}
                    value={baseUrl}
                    onChange={(e) => handleBaseUrlChange(e.target.value)}
                    className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 font-mono transition-colors"
                  />
                )}
              </div>

              {/* Model Selection & Dynamic Fetch */}
              <div className="space-y-1.5 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-neutral-700 dark:text-neutral-300 text-[11px] font-medium flex items-center space-x-1.5">
                    <Sliders className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
                    <span>Model</span>
                  </label>

                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setManualModelMode(!manualModelMode)}
                      className="text-[10px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
                    >
                      {manualModelMode ? 'List View' : 'Custom Model'}
                    </button>

                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 dark:border-neutral-700 px-2 py-0.5 rounded text-[10px] font-medium flex items-center space-x-1 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                      <span>{isFetchingModels ? 'Fetching...' : 'Fetch Models'}</span>
                    </button>
                  </div>
                </div>

                {/* Status indicator after fetch */}
                {modelsFetchSuccess && (
                  <div className="text-[10px] text-neutral-600 dark:text-neutral-400 flex items-center space-x-1">
                    <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>{modelsFetchSuccess}</span>
                  </div>
                )}

                {modelsFetchError && (
                  <div className="text-[10px] text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded p-2 flex items-start space-x-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0 mt-0.5" />
                    <span>{modelsFetchError}</span>
                  </div>
                )}

                {manualModelMode ? (
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder="Enter model ID (e.g. gpt-4o, claude-3-5-sonnet)"
                    className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-950 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 font-mono transition-colors"
                  />
                ) : availableModels.length > 0 ? (
                  <select
                    value={model}
                    onChange={(e) => handleModelChange(e.target.value)}
                    className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-950 dark:text-white focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 font-mono transition-colors"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={model}
                      onChange={(e) => handleModelChange(e.target.value)}
                      placeholder="e.g. gpt-4o, gemini-1.5-flash"
                      className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-1.5 text-xs text-neutral-950 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 font-mono transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleFetchModels}
                      disabled={isFetchingModels}
                      className="bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      Fetch List
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Three.js Skills Engine Indicator */}
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-2.5 flex items-center justify-between text-[11px] transition-colors">
              <div className="flex items-center space-x-2">
                <BookOpen className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                <span className="font-medium text-neutral-800 dark:text-neutral-200">Three.js Skills Engine</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSkillsModal(!showSkillsModal)}
                className="text-[10px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors underline"
              >
                {installedSkills.length} Skills Active
              </button>
            </div>

            {/* Expandable Skills List Modal / Drawer */}
            {showSkillsModal && (() => {
              const categories = ['All', ...Array.from(new Set(installedSkills.map((s) => s.category))).sort()];
              const q = skillSearch.trim().toLowerCase();
              const filteredSkills = installedSkills.filter((s) => {
                if (skillCategory !== 'All' && s.category !== skillCategory) return false;
                if (!q) return true;
                return (
                  s.id.toLowerCase().includes(q) ||
                  s.name.toLowerCase().includes(q) ||
                  s.category.toLowerCase().includes(q) ||
                  s.description.toLowerCase().includes(q)
                );
              });

              return (
                <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-2 transition-colors">
                  <div className="flex items-center justify-between text-xs font-medium border-b border-neutral-200 dark:border-neutral-800 pb-1.5">
                    <span className="text-neutral-900 dark:text-neutral-200">
                      Three.js Skills Library ({filteredSkills.length}/{installedSkills.length})
                    </span>
                    <div className="flex items-center space-x-1.5">
                      <button
                        type="button"
                        onClick={() => loadInstalledSkills(true)}
                        disabled={isLoadingSkills}
                        title="Reload skills from disk"
                        className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 p-0.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${isLoadingSkills ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowSkillsModal(false)}
                        className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Search & Category Filter */}
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                      placeholder="Search skills (e.g. ocean, shader, r3f)..."
                      className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded px-2 py-1 text-[11px] text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                    />
                    <select
                      value={skillCategory}
                      onChange={(e) => setSkillCategory(e.target.value)}
                      className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded px-1.5 py-1 text-[10px] text-neutral-800 dark:text-neutral-200 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 text-[10px]">
                    {filteredSkills.length > 0 ? (
                      filteredSkills.map((s) => (
                        <div key={s.id} className="border-b border-neutral-200 dark:border-neutral-800 pb-1.5 last:border-b-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-neutral-800 dark:text-neutral-200 font-medium truncate">
                              {s.id}
                            </span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-neutral-200/80 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 flex-shrink-0">
                              {s.category}
                            </span>
                          </div>
                          {s.description && (
                            <div className="text-neutral-500 line-clamp-2 mt-0.5">{s.description}</div>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-neutral-500 text-center py-4">No matching skills found.</div>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Multi-Image Reference Dropzone */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-neutral-600 dark:text-neutral-400 font-medium text-[11px] flex items-center space-x-1.5">
                  <span>Reference Images</span>
                  {referenceImages.length > 0 && (
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-300">
                      {referenceImages.length}/{MAX_REFERENCE_IMAGES}
                    </span>
                  )}
                </label>

                {referenceImages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setReferenceImages([])}
                    className="text-[10px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingImages(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingImages(false);
                }}
                onDrop={handleImageDrop}
                className={`border rounded-lg p-2.5 transition-colors ${
                  isDraggingImages
                    ? 'border-neutral-900 dark:border-white bg-neutral-100 dark:bg-neutral-900'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40'
                }`}
              >
                {referenceImages.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {referenceImages.map((img, idx) => (
                      <div
                        key={img.id}
                        className="relative group aspect-square rounded-md overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950"
                      >
                        <img
                          src={img.dataUrl}
                          alt={img.name || `Reference ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 left-1 bg-neutral-950/80 text-white text-[9px] font-mono px-1.5 py-0.5 rounded">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(img.id)}
                          title="Remove image"
                          className="absolute top-1 right-1 bg-white/95 hover:bg-neutral-100 border border-neutral-200 text-neutral-800 dark:bg-neutral-900/95 dark:hover:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 p-0.5 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {referenceImages.length < MAX_REFERENCE_IMAGES && (
                      <label className="aspect-square rounded-md border border-dashed border-neutral-300 hover:border-neutral-500 dark:border-neutral-700 dark:hover:border-neutral-500 bg-white dark:bg-neutral-950 flex flex-col items-center justify-center cursor-pointer text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white transition-colors">
                        <Plus className="w-4 h-4 mb-0.5" />
                        <span className="text-[10px] font-medium">Add</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                ) : (
                  <label className="cursor-pointer block py-3 text-center">
                    <Upload className="w-5 h-5 mx-auto text-neutral-400 dark:text-neutral-500 mb-1" />
                    <span className="text-neutral-700 dark:text-neutral-300 text-xs font-normal">
                      Click or drag images to sculpt
                    </span>
                    <span className="block text-[10px] text-neutral-500 mt-0.5">
                      Select multiple views (up to {MAX_REFERENCE_IMAGES}) · PNG, JPG, WebP
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              {referenceImages.length > 0 && (
                <div className="flex items-center space-x-1.5 pt-0.5 text-[11px] text-neutral-600 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    id="sendImage"
                    checked={sendImageToModel}
                    onChange={(e) => setSendImageToModel(e.target.checked)}
                    className="rounded bg-white dark:bg-neutral-950 border-neutral-300 dark:border-neutral-800 text-neutral-950 dark:text-white focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="sendImage" className="cursor-pointer text-[10px] text-neutral-600 dark:text-neutral-400 select-none">
                    Send {referenceImages.length} {referenceImages.length === 1 ? 'image' : 'images'} payload (uncheck for text/code-only models)
                  </label>
                </div>
              )}
            </div>

            {/* Prompt Field */}
            <div className="space-y-1">
              <label className="text-neutral-600 dark:text-neutral-400 font-medium text-[11px] block">
                Sculpting Prompt
              </label>
              <textarea
                rows={3}
                placeholder="Describe the 3D model to sculpt..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="w-full bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 text-xs text-neutral-950 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 resize-none transition-colors"
              />
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 text-neutral-800 dark:text-neutral-300 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-neutral-500 dark:text-neutral-400 flex-shrink-0 mt-0.5" />
                <span className="text-[11px]">{errorMessage}</span>
              </div>
            )}

            {/* Current Stage Indicator */}
            {currentStage && (
              <div className="bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 text-neutral-800 dark:text-neutral-300 flex items-center space-x-2">
                <RefreshCw className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 animate-spin" />
                <span className="text-xs">{currentStage}</span>
              </div>
            )}

            {/* Generate Button - Flat Solid Monochrome */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full bg-neutral-950 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 text-white dark:bg-white dark:hover:bg-neutral-200 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500 disabled:cursor-not-allowed dark:text-neutral-950 font-medium py-2 rounded-md shadow-sm flex items-center justify-center space-x-2 transition-colors"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Sculpting with Skills Engine...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Procedural 3D Model</span>
                </>
              )}
            </button>

            {/* Available Model Animations Card (Synced with 3D Viewport) */}
            {availableAnimations.length > 0 && (
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2 transition-colors">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center space-x-1.5 font-medium text-neutral-800 dark:text-neutral-200">
                    <Film className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                    <span>Available Animations</span>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500">
                    {availableAnimations.length} {availableAnimations.length === 1 ? 'clip' : 'clips'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {availableAnimations.map((animName) => {
                    const isSelected = activeAnimation === animName;
                    return (
                      <button
                        key={animName}
                        type="button"
                        onClick={() => onSelectAnimation?.(animName)}
                        className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${
                          isSelected
                            ? 'bg-neutral-950 border-neutral-950 text-white dark:bg-white dark:border-white dark:text-neutral-950 font-medium'
                            : 'bg-white hover:bg-neutral-100 border-neutral-200 text-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:border-neutral-800 dark:text-neutral-300'
                        }`}
                      >
                        {formatAnimationLabel(animName)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Agent Visual Analysis Output & Applied Skills */}
            {agentAnalysis && (
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2 mt-2">
                <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-300 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <FileCode className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                    <span>Sculpt Notes</span>
                  </div>
                </div>

                {/* Applied Skills Pills */}
                {usedSkills.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-neutral-200 dark:border-neutral-800">
                    <div className="text-[10px] text-neutral-500 font-medium">Applied Three.js Skills:</div>
                    <div className="flex flex-wrap gap-1">
                      {usedSkills.map((sk) => (
                        <span key={sk} className="bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300 px-1.5 py-0.5 rounded text-[10px] font-mono">
                          {sk}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {agentAnalysis}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: LIVE CODE EDITOR (No Demos) */}
        {/* ============================================================== */}
        {activeTab === 'editor' && (
          <div className="h-full flex flex-col space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-600 dark:text-neutral-400 text-[11px] font-medium">Three.js Script (TypeScript)</span>
              {code && (
                <button
                  type="button"
                  onClick={() => {
                    onCodeChange('');
                    setEditorText('');
                    syncLocalCodeToSession('', 'Workspace');
                  }}
                  className="text-[10px] text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-300 transition-colors"
                >
                  Clear Code
                </button>
              )}
            </div>

            {/* Error Alert if code breaks */}
            {codeError && (
              <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2 text-neutral-800 dark:text-neutral-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 flex-shrink-0" />
                <span className="font-mono text-[11px] truncate">{codeError}</span>
              </div>
            )}

            {/* Textarea Code Editor */}
            <div className="flex-1 flex flex-col min-h-[380px]">
              <textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="import * as THREE from 'three';&#10;&#10;export function createModel(): THREE.Group {&#10;  const group = new THREE.Group();&#10;  // write procedural geometry here&#10;  return group;&#10;}"
                spellCheck={false}
                className="w-full flex-1 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 text-xs font-mono text-neutral-900 dark:text-neutral-200 placeholder-neutral-400 dark:placeholder-neutral-700 leading-relaxed focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-700 resize-none overflow-auto transition-colors"
              />
            </div>

            {/* Apply Button */}
            <button
              type="button"
              onClick={() => {
                onCodeChange(editorText);
                syncLocalCodeToSession(editorText, 'Custom 3D Model');
              }}
              className="w-full bg-neutral-950 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-950 font-medium py-2 rounded-md shadow-sm flex items-center justify-center space-x-1.5 text-xs transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Apply & Run in Viewport</span>
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: HTTPS MCP SERVER & SESSION CONNECTOR */}
        {/* ============================================================== */}
        {activeTab === 'api' && (() => {
          const origin = typeof window !== 'undefined' ? window.location.origin : 'https://threejs-asset-generator.vercel.app';
          const cleanToken = sessionId.trim();
          const mcpUrl = cleanToken ? `${origin}/mcp?token=${encodeURIComponent(cleanToken)}` : '';
          const mcpConfigJson = cleanToken
            ? JSON.stringify(
                {
                  mcpServers: {
                    'threejs-asset-generator': {
                      url: mcpUrl,
                    },
                  },
                },
                null,
                2
              )
            : '';

          return (
            <div className="space-y-4 text-xs">
              {/* Session Token Card */}
              <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 space-y-3 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-medium text-neutral-950 dark:text-white text-xs">
                    <KeyRound className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-300" />
                    <span>MCP Session Token</span>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
                    HTTPS JSON-RPC · No SSE
                  </span>
                </div>

                <p className="text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed">
                  Create a custom session token to bind your web chat agent or coding agent to this live 3D viewport. Saved locally in your browser.
                </p>

                {/* Token Input + Generate / Clear */}
                <div className="space-y-1.5">
                  <div className="flex items-center space-x-1.5">
                    <input
                      type="text"
                      value={sessionId}
                      onChange={(e) => onSessionIdChange(e.target.value)}
                      placeholder="Enter custom token (e.g. example-session)"
                      spellCheck={false}
                      className="flex-1 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-1.5 text-xs font-mono text-neutral-950 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-600 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleGenerateToken}
                      title="Generate Random Session Token"
                      className="flex items-center space-x-1 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:border-neutral-800 dark:text-neutral-200 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                    >
                      <Shuffle className="w-3 h-3" />
                      <span>Generate</span>
                    </button>
                    {cleanToken && (
                      <button
                        type="button"
                        onClick={() => onSessionIdChange('')}
                        title="Clear Session Token"
                        className="p-1.5 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-500 hover:text-neutral-950 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:border-neutral-800 dark:text-neutral-400 dark:hover:text-white rounded-md transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Live Sync Status & Toggle */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="text-[11px] text-neutral-700 dark:text-neutral-300 flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoPoll}
                        onChange={(e) => setAutoPoll(e.target.checked)}
                        className="rounded bg-white dark:bg-neutral-950 border-neutral-300 dark:border-neutral-800 text-neutral-900 dark:text-neutral-200 focus:ring-0"
                      />
                      <span>Auto-sync viewport with MCP pushes</span>
                    </label>

                    <span className="flex items-center space-x-1 text-[10px] font-mono">
                      <Radio className={`w-3 h-3 ${cleanToken && autoPoll ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-600'}`} />
                      <span className={cleanToken && autoPoll ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500'}>
                        {cleanToken && autoPoll ? 'Listening' : 'Idle'}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Live HTTPS MCP Endpoint URL */}
              {cleanToken ? (
                <>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300 text-[11px] flex items-center space-x-1.5">
                        <Link2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                        <span>HTTPS MCP Server URL</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText('mcpUrl', mcpUrl)}
                        className="flex items-center space-x-1 text-[10px] text-neutral-700 hover:text-neutral-950 bg-neutral-100 border border-neutral-200 dark:text-neutral-300 dark:hover:text-white dark:bg-neutral-900 dark:border-neutral-800 px-2 py-0.5 rounded transition-colors"
                      >
                        {copiedField === 'mcpUrl' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy URL</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md px-2.5 py-2 font-mono text-[11px] text-neutral-900 dark:text-neutral-100 break-all select-all">
                      {mcpUrl}
                    </div>
                  </div>

                  {/* Copyable MCP JSON Config */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-neutral-700 dark:text-neutral-300 text-[11px]">
                        MCP Client Config (JSON)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText('mcpConfig', mcpConfigJson)}
                        className="flex items-center space-x-1 text-[10px] text-neutral-700 hover:text-neutral-950 bg-neutral-100 border border-neutral-200 dark:text-neutral-300 dark:hover:text-white dark:bg-neutral-900 dark:border-neutral-800 px-2 py-0.5 rounded transition-colors"
                      >
                        {copiedField === 'mcpConfig' ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                            <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy JSON</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 font-mono text-[11px] text-neutral-800 dark:text-neutral-300 overflow-x-auto">
                      <pre>{mcpConfigJson}</pre>
                    </div>
                  </div>

                  {/* Exposed MCP Tools List */}
                  <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3 space-y-2">
                    <div className="text-[11px] font-medium text-neutral-800 dark:text-neutral-300">Exposed MCP Tools</div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-neutral-900 dark:text-neutral-200">push_3d_code</span>
                        <span className="text-neutral-500 text-right">Render Three.js code live</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-neutral-900 dark:text-neutral-200">get_viewport_screenshot</span>
                        <span className="text-neutral-500 text-right">Return PNG render feedback</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-neutral-900 dark:text-neutral-200">get_current_code</span>
                        <span className="text-neutral-500 text-right">Inspect active scene code</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-neutral-900 dark:text-neutral-200">get_threejs_skills</span>
                        <span className="text-neutral-500 text-right">Query {installedSkills.length || 13} Three.js skill docs</span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-neutral-900 dark:text-neutral-200">clear_viewport</span>
                        <span className="text-neutral-500 text-right">Reset active canvas</span>
                      </div>
                    </div>
                  </div>

                  {/* Quick HTTPS JSON-RPC Test Snippet */}
                  <div className="space-y-1.5">
                    <div className="font-medium text-neutral-700 dark:text-neutral-300 text-[11px]">
                      Test HTTPS MCP Endpoint (cURL)
                    </div>
                    <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 font-mono text-[11px] text-neutral-800 dark:text-neutral-300 overflow-x-auto">
                      <pre>{`curl -X POST "${mcpUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</pre>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200 dark:border-neutral-800 border-dashed rounded-md p-4 text-center space-y-2">
                  <KeyRound className="w-5 h-5 text-neutral-400 dark:text-neutral-500 mx-auto" />
                  <div className="text-neutral-800 dark:text-neutral-300 font-medium text-xs">No Session Token Set</div>
                  <p className="text-[11px] text-neutral-500 leading-relaxed">
                    Enter your own session token above or click Generate to create your private HTTPS MCP endpoint URL.
                  </p>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
};
