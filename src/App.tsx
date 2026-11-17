import React, { useState, useEffect } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { AgentPanel } from './components/AgentPanel';
import { Box, Server, KeyRound, ExternalLink } from 'lucide-react';

const SESSION_STORAGE_KEY = 'threejs_asset_gen_session_token';
const CODE_STORAGE_KEY = 'studio_code';

function sanitizeTokenInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 128);
}

export function App() {
  // Start with empty code by default - no demos
  const [code, setCode] = useState<string>(() => {
    return localStorage.getItem(CODE_STORAGE_KEY) || '';
  });

  // Custom session token stored in localStorage (no forced default value)
  const [sessionId, setSessionId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token') || params.get('session');
    if (urlToken) {
      const clean = sanitizeTokenInput(urlToken);
      if (clean) {
        localStorage.setItem(SESSION_STORAGE_KEY, clean);
        return clean;
      }
    }
    return localStorage.getItem(SESSION_STORAGE_KEY) || '';
  });

  const [activeTab, setActiveTab] = useState<'agent' | 'editor' | 'api'>('agent');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean>(false);

  // Sync working code to local storage
  const handleCodeChange = (newCode: string) => {
    setCode(newCode);
    localStorage.setItem(CODE_STORAGE_KEY, newCode);
  };

  // Sync custom session token to local storage
  const handleSessionIdChange = (newToken: string) => {
    const clean = sanitizeTokenInput(newToken);
    setSessionId(clean);
    if (clean) {
      localStorage.setItem(SESSION_STORAGE_KEY, clean);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  };

  // Check backend health
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.status === 'ok') setServerOnline(true);
      })
      .catch(() => setServerOnline(false));
  }, []);

  return (
    <div className="w-screen h-screen flex flex-col bg-studio-950 text-neutral-100 overflow-hidden font-sans">
      {/* Top Application Header - Flat, Minimal, Clean */}
      <header className="h-12 bg-studio-950 border-b border-studio-800 flex items-center justify-between px-4 z-20 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-md bg-neutral-900 border border-neutral-750 flex items-center justify-center text-neutral-100">
            <Box className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="font-semibold text-sm tracking-tight text-white">threejs-asset-generator</h1>
            <span className="text-neutral-600 text-xs">/</span>
            <span className="text-neutral-400 text-xs font-normal">mcp</span>
          </div>
        </div>

        {/* Center / Right Status & Session Indicator */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Server Status Pill */}
          <div className="flex items-center space-x-1.5 bg-neutral-900 border border-neutral-800 px-2.5 py-1 rounded-md text-[11px]">
            <Server className="w-3 h-3 text-neutral-400" />
            <span className="text-neutral-400">MCP:</span>
            {serverOnline ? (
              <span className="text-emerald-400 flex items-center space-x-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>HTTPS Online</span>
              </span>
            ) : (
              <span className="text-amber-400 flex items-center space-x-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Connecting</span>
              </span>
            )}
          </div>

          <div className="h-3 w-px bg-neutral-800" />

          {/* Session Token Button - clicks straight to MCP tab */}
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            title="Configure MCP Session Token"
            className="flex items-center space-x-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 px-2.5 py-1 rounded-md text-[11px] text-neutral-300 transition-colors"
          >
            <KeyRound className="w-3 h-3 text-neutral-400" />
            <span className={`font-mono ${sessionId ? 'text-neutral-100' : 'text-neutral-500'}`}>
              {sessionId || 'Set Session Token'}
            </span>
          </button>

          <a
            href="https://github.com/karthi-techdev/threejs-asset-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1 text-neutral-400 hover:text-white px-2 py-1 rounded text-xs transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3 text-neutral-500" />
          </a>
        </div>
      </header>

      {/* Main Studio Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Viewport (66% width) */}
        <div className="w-[66%] h-full relative border-r border-studio-800">
          <Viewport3D
            code={code}
            sessionId={sessionId}
            onCodeError={setCodeError}
          />
        </div>

        {/* Right Studio Panel (34% width) */}
        <div className="w-[34%] h-full">
          <AgentPanel
            code={code}
            onCodeChange={handleCodeChange}
            sessionId={sessionId}
            onSessionIdChange={handleSessionIdChange}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            codeError={codeError}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
