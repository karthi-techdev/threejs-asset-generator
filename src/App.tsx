import React, { useState, useEffect, useCallback } from 'react';
import { Viewport3D } from './components/Viewport3D';
import { AgentPanel } from './components/AgentPanel';
import { Box, Server, KeyRound, ExternalLink, Sun, Moon } from 'lucide-react';

const SESSION_STORAGE_KEY = 'threejs_asset_gen_session_token';
const CODE_STORAGE_KEY = 'studio_code';
const THEME_STORAGE_KEY = 'threejs_asset_gen_theme';

export type UiTheme = 'light' | 'dark';

function sanitizeTokenInput(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 128);
}

export function App() {
  // UI Theme (Light / Dark) stored in localStorage
  const [uiTheme, setUiTheme] = useState<UiTheme>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });

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
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);
  const [activeAnimation, setActiveAnimation] = useState<string | null>(null);

  const handleAnimationsDetected = useCallback((names: string[], defaultName: string | null) => {
    setAvailableAnimations(names);
    setActiveAnimation(defaultName);
  }, []);

  // Sync light/dark class on <html> and persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (uiTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem(THEME_STORAGE_KEY, uiTheme);
  }, [uiTheme]);

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
    <div className="w-screen h-screen flex flex-col bg-white dark:bg-studio-950 text-neutral-950 dark:text-neutral-100 overflow-hidden font-sans transition-colors">
      {/* Top Application Header - Flat, Minimal, Clean */}
      <header className="h-12 bg-white dark:bg-studio-950 border-b border-neutral-200 dark:border-studio-800 flex items-center justify-between px-4 z-20 flex-shrink-0 transition-colors">
        <div className="flex items-center space-x-3">
          <div className="w-7 h-7 rounded-md bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 flex items-center justify-center text-neutral-900 dark:text-neutral-100">
            <Box className="w-4 h-4" />
          </div>
          <div className="flex items-center space-x-2">
            <h1 className="font-semibold text-sm tracking-tight text-neutral-950 dark:text-white">threejs-asset-generator</h1>
            <span className="text-neutral-300 dark:text-neutral-600 text-xs">/</span>
            <span className="text-neutral-500 dark:text-neutral-400 text-xs font-normal">mcp</span>
          </div>
        </div>

        {/* Center / Right Status, Theme Switcher & Session Indicator */}
        <div className="flex items-center space-x-3 text-xs">
          {/* Server Status Pill */}
          <div className="flex items-center space-x-1.5 bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 rounded-md text-[11px]">
            <Server className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
            <span className="text-neutral-500 dark:text-neutral-400">MCP:</span>
            {serverOnline ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
                <span>HTTPS Online</span>
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 flex items-center space-x-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400" />
                <span>Connecting</span>
              </span>
            )}
          </div>

          <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-800" />

          {/* Session Token Button - clicks straight to MCP tab */}
          <button
            type="button"
            onClick={() => setActiveTab('api')}
            title="Configure MCP Session Token"
            className="flex items-center space-x-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 px-2.5 py-1 rounded-md text-[11px] text-neutral-700 dark:text-neutral-300 transition-colors"
          >
            <KeyRound className="w-3 h-3 text-neutral-500 dark:text-neutral-400" />
            <span className={`font-mono ${sessionId ? 'text-neutral-950 dark:text-neutral-100' : 'text-neutral-500'}`}>
              {sessionId || 'Set Session Token'}
            </span>
          </button>

          <div className="h-3 w-px bg-neutral-200 dark:bg-neutral-800" />

          {/* Flat Segmented Light / Dark Mode Switcher */}
          <div
            role="group"
            aria-label="Color theme"
            className="flex items-center bg-neutral-100 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-0.5 rounded-md text-[11px]"
          >
            <button
              type="button"
              onClick={() => setUiTheme('light')}
              aria-pressed={uiTheme === 'light'}
              title="Enable Light Mode"
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                uiTheme === 'light'
                  ? 'bg-white text-neutral-950 font-medium border border-neutral-200'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-transparent'
              }`}
            >
              <Sun className="w-3 h-3" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setUiTheme('dark')}
              aria-pressed={uiTheme === 'dark'}
              title="Enable Dark Mode"
              className={`flex items-center space-x-1 px-2 py-0.5 rounded transition-colors ${
                uiTheme === 'dark'
                  ? 'bg-neutral-800 text-white font-medium border border-neutral-700'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border border-transparent'
              }`}
            >
              <Moon className="w-3 h-3" />
              <span>Dark</span>
            </button>
          </div>

          <a
            href="https://github.com/karthi-techdev/threejs-asset-generator"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1 text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white px-2 py-1 rounded text-xs transition-colors"
          >
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
          </a>
        </div>
      </header>

      {/* Main Studio Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left / Center Viewport (66% width) */}
        <div className="w-[66%] h-full relative border-r border-neutral-200 dark:border-studio-800">
          <Viewport3D
            code={code}
            sessionId={sessionId}
            uiTheme={uiTheme}
            activeAnimation={activeAnimation}
            onSelectAnimation={setActiveAnimation}
            onAnimationsDetected={handleAnimationsDetected}
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
            availableAnimations={availableAnimations}
            activeAnimation={activeAnimation}
            onSelectAnimation={setActiveAnimation}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
