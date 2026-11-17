import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { transform } from 'sucrase';
import { 
  Grid, 
  Layers, 
  Download, 
  Play, 
  Pause,
  Camera,
  Box,
  FileCode2,
  RotateCcw
} from 'lucide-react';

interface Viewport3DProps {
  code: string;
  sessionId: string;
  onCodeError?: (error: string | null) => void;
  onExportGlb?: () => void;
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  code,
  sessionId,
  onCodeError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelRef = useRef<THREE.Object3D | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);

  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'neutral' | 'pitch'>('dark');
  const [polyCount, setPolyCount] = useState(0);
  const [fps, setFps] = useState(60);

  // Solid flat background colors (No Gradients)
  const bgColors: Record<string, number> = {
    dark: 0x09090b,
    neutral: 0x121215,
    pitch: 0x000000,
  };

  /**
   * Initializes Three.js Scene, Camera, Renderer, Lights, Controls
   */
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColors.dark);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 2.8, 7.5);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    rendererRef.current = renderer;

    container.replaceChildren(renderer.domElement);

    // 4. Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 1.8, 0);
    controlsRef.current = controls;

    // 5. Lighting Rig (Flat Clean Studio Lighting)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(-4, 7, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.0005;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -6;
    dirLight.shadow.camera.right = 6;
    dirLight.shadow.camera.top = 6;
    dirLight.shadow.camera.bottom = -6;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xa1a1aa, 0.4);
    fillLight.position.set(5, 3, -4);
    scene.add(fillLight);

    // 6. Grid Helper (Subtle Dark Neutral)
    const gridHelper = new THREE.GridHelper(14, 28, 0x3f3f46, 0x202024);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    // 7. Animation Loop with FPS Tracker
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = performance.now();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      const now = performance.now();
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      // Track FPS
      frameCount++;
      if (now - fpsTimer >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        fpsTimer = now;
      }

      // Execute custom model animation tick hook if present
      if (isPlaying && currentModelRef.current?.userData?.tick) {
        try {
          currentModelRef.current.userData.tick(dt, now / 1000);
        } catch (e) {
          // suppress runtime tick errors
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 8. Resize Listener
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, []);

  /**
   * Updates Solid Background (No Gradients)
   */
  useEffect(() => {
    if (!sceneRef.current) return;
    const colorHex = bgColors[theme] ?? 0x09090b;
    sceneRef.current.background = new THREE.Color(colorHex);
  }, [theme]);

  /**
   * Updates Grid Visibility
   */
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid;
    }
  }, [showGrid]);

  /**
   * Compiles and executes procedural Three.js code in sandbox
   */
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    try {
      // Clean up previous model
      if (currentModelRef.current) {
        scene.remove(currentModelRef.current);
        currentModelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((m) => m.dispose());
            } else {
              child.material?.dispose();
            }
          }
        });
        currentModelRef.current = null;
      }

      const safeCode = typeof code === 'string' ? code : '';

      // When code is empty (no demo), reset polycount and clear error
      if (!safeCode.trim()) {
        setPolyCount(0);
        onCodeError?.(null);
        return;
      }

      // Compile function from source code
      let cleaned = safeCode
        .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
        .replace(/export\s+function\s+createModel/g, 'function createModel')
        .replace(/export\s+default\s+function/g, 'function createModel')
        .replace(/export\s+/g, '');

      let transpiled = cleaned;
      try {
        transpiled = transform(cleaned, { transforms: ['typescript'] }).code;
      } catch (tsErr: any) {
        console.warn('Sucrase TypeScript stripping warning:', tsErr);
      }

      // Evaluate within a scoped sandbox passing THREE
      const factoryFn = new Function('THREE', `
        ${transpiled}
        if (typeof createModel === 'function') return createModel();
        if (typeof createAnimeTreeModel === 'function') return createAnimeTreeModel();
        if (typeof createScene === 'function') return createScene();
        if (typeof init === 'function') return init();
        throw new Error("No 'createModel()' function found in code.");
      `);

      const model = factoryFn(THREE);

      if (!(model instanceof THREE.Object3D)) {
        throw new Error('createModel() must return a THREE.Group or THREE.Object3D.');
      }

      // Calculate polygons
      let totalTris = 0;
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry) {
          const geom = obj.geometry;
          if (geom.index) {
            totalTris += geom.index.count / 3;
          } else if (geom.attributes.position) {
            totalTris += geom.attributes.position.count / 3;
          }
          if (wireframe && obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => (m.wireframe = true));
            } else {
              obj.material.wireframe = true;
            }
          }
        }
      });

      setPolyCount(Math.round(totalTris));
      scene.add(model);
      currentModelRef.current = model;

      onCodeError?.(null);

      // Send rendered frame capture to backend for vision agent feedback
      setTimeout(() => {
        captureAndPushRender();
      }, 400);
    } catch (err: any) {
      console.error('Live Three.js execution error:', err);
      onCodeError?.(err.message || 'Execution error');
    }
  }, [code, wireframe, sessionId]);

  /**
   * Captures the rendered WebGL canvas screenshot and sends to API server
   */
  const captureAndPushRender = useCallback(async () => {
    const cleanSession = sessionId.trim();
    if (!rendererRef.current || !cleanSession) return;
    try {
      const dataUrl = rendererRef.current.domElement.toDataURL('image/png', 0.85);
      await fetch(`/api/sessions/${encodeURIComponent(cleanSession)}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ screenshot: dataUrl }),
      });
    } catch (err) {
      // ignore render push errors
    }
  }, [sessionId]);

  /**
   * Camera Angle Presets
   */
  const handleResetCamera = (view: 'perspective' | 'front' | 'top') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    controls.target.set(0, 1.8, 0);

    if (view === 'front') {
      camera.position.set(0, 1.8, 7.5);
    } else if (view === 'top') {
      camera.position.set(0, 8.5, 0.01);
    } else {
      camera.position.set(0, 2.8, 7.5);
    }
    controls.update();
  };

  /**
   * Merges color map and alpha map into an RGBA canvas texture for glTF standard PBR export.
   */
  const composeRgbaCanvasTexture = (colorTex: THREE.Texture, alphaTex?: THREE.Texture): THREE.Texture => {
    if (typeof document === 'undefined') return colorTex;
    const colorSource = colorTex.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
    if (!colorSource) return colorTex;

    const width = colorSource.width || 512;
    const height = colorSource.height || 512;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return colorTex;

    ctx.drawImage(colorSource, 0, 0, width, height);

    if (alphaTex && alphaTex.image) {
      const alphaCanvas = document.createElement('canvas');
      alphaCanvas.width = width;
      alphaCanvas.height = height;
      const aCtx = alphaCanvas.getContext('2d');
      if (aCtx) {
        aCtx.drawImage(alphaTex.image as CanvasImageSource, 0, 0, width, height);
        const colorImgData = ctx.getImageData(0, 0, width, height);
        const alphaImgData = aCtx.getImageData(0, 0, width, height);
        for (let i = 0; i < colorImgData.data.length; i += 4) {
          colorImgData.data[i + 3] = alphaImgData.data[i];
        }
        ctx.putImageData(colorImgData, 0, 0);
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = colorTex.wrapS;
    texture.wrapT = colorTex.wrapT;
    texture.repeat.copy(colorTex.repeat);
    texture.offset.copy(colorTex.offset);
    texture.needsUpdate = true;
    return texture;
  };

  /**
   * Converts non-standard ShaderMaterials into standard glTF-compliant MeshStandardMaterials.
   */
  const convertShaderMaterialToStandard = (shaderMat: THREE.ShaderMaterial): THREE.MeshStandardMaterial => {
    if (shaderMat.userData?.gltfMaterial instanceof THREE.Material) {
      return shaderMat.userData.gltfMaterial.clone() as THREE.MeshStandardMaterial;
    }

    const uniforms = (shaderMat.uniforms || {}) as Record<string, { value: unknown }>;
    const isTexture = (v: unknown): v is THREE.Texture =>
      !!v && typeof v === 'object' && (v as THREE.Texture).isTexture === true;

    const colorCandidates = [
      uniforms.uColorMap?.value,
      uniforms.map?.value,
      uniforms.diffuseMap?.value,
      uniforms.baseTexture?.value,
    ];
    const colorTexture = colorCandidates.find((v): v is THREE.Texture => isTexture(v));

    const alphaCandidates = [
      uniforms.uAlphaMap?.value,
      uniforms.alphaMap?.value,
      uniforms.maskMap?.value,
    ];
    const alphaTexture = alphaCandidates.find((v): v is THREE.Texture => isTexture(v));

    let finalMap: THREE.Texture | undefined = colorTexture;
    let hasAlpha = false;

    if (colorTexture) {
      if (alphaTexture) {
        finalMap = composeRgbaCanvasTexture(colorTexture, alphaTexture);
        hasAlpha = true;
      } else {
        finalMap = colorTexture;
      }
    }

    let baseColor = new THREE.Color(0xffffff);
    const colorVal = uniforms.uMidGreen?.value ?? uniforms.color?.value ?? uniforms.diffuse?.value;
    if (colorVal instanceof THREE.Color) {
      baseColor = colorVal.clone();
    }

    return new THREE.MeshStandardMaterial({
      name: shaderMat.name || 'shader-pbr',
      map: finalMap ?? null,
      color: finalMap ? 0xffffff : baseColor,
      roughness: 0.8,
      metalness: 0.05,
      side: shaderMat.side ?? THREE.DoubleSide,
      transparent: false,
      alphaTest: hasAlpha || shaderMat.transparent ? 0.42 : 0.0,
      depthWrite: shaderMat.depthWrite ?? true,
      wireframe: shaderMat.wireframe ?? false,
    });
  };

  /**
   * Exports the active model to .GLB binary file with glTF-compliant PBR materials
   */
  const handleExportGLB = () => {
    if (!currentModelRef.current) return;

    // Clone and sanitize model so custom ShaderMaterials are converted to standard glTF PBR materials
    const exportRoot = currentModelRef.current.clone(true);
    exportRoot.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) {
        const convertMat = (mat: THREE.Material): THREE.Material => {
          if (mat.userData?.gltfMaterial instanceof THREE.Material) {
            return mat.userData.gltfMaterial.clone();
          }
          if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
            return convertShaderMaterialToStandard(mat as THREE.ShaderMaterial);
          }
          return mat.clone();
        };

        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map(convertMat);
        } else if (mesh.material) {
          mesh.material = convertMat(mesh.material);
        }
      }
    });

    const exporter = new GLTFExporter();
    exporter.parse(
      exportRoot,
      (gltf) => {
        const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentModelRef.current?.name || 'model'}.glb`;
        a.click();
        URL.revokeObjectURL(url);
      },
      (error) => {
        console.error('GLTF Export error:', error);
      },
      { binary: true }
    );
  };

  /**
   * Downloads clean TypeScript code file
   */
  const handleDownloadCode = () => {
    if (!code) return;
    const blob = new Blob([code], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'createModel.ts';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-neutral-950 overflow-hidden select-none">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Empty State Overlay when no model is loaded (no demo) */}
      {!(typeof code === 'string' && code.trim()) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-neutral-500 space-y-3 z-0">
          <div className="w-12 h-12 rounded-lg border border-neutral-800 bg-neutral-900/60 flex items-center justify-center text-neutral-400">
            <Box className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div className="text-center space-y-1">
            <div className="text-sm font-medium text-neutral-300">Ready to Sculpt</div>
            <div className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              Connect an AI agent to generate procedural Three.js models, or paste code into the editor.
            </div>
          </div>
        </div>
      )}

      {/* Top Floating Viewport Toolbar - Minimal, Flat */}
      <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-neutral-900/95 px-2.5 py-1.5 rounded-md border border-neutral-800 z-10 text-xs">
        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid"
          className={`p-1.5 rounded transition-colors ${showGrid ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:text-white'}`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setWireframe(!wireframe)}
          title="Toggle Wireframe"
          className={`p-1.5 rounded transition-colors ${wireframe ? 'text-white bg-neutral-800' : 'text-neutral-400 hover:text-white'}`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause Animation' : 'Play Animation'}
          className={`p-1.5 rounded transition-colors ${isPlaying ? 'text-neutral-200' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <div className="h-3.5 w-px bg-neutral-800 mx-1" />

        {/* Backdrop Presets (Solid Flat Colors) */}
        <button
          onClick={() => setTheme('dark')}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${theme === 'dark' ? 'text-white bg-neutral-800 font-medium' : 'text-neutral-400 hover:text-white'}`}
        >
          Dark
        </button>

        <button
          onClick={() => setTheme('neutral')}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${theme === 'neutral' ? 'text-white bg-neutral-800 font-medium' : 'text-neutral-400 hover:text-white'}`}
        >
          Neutral
        </button>

        <button
          onClick={() => setTheme('pitch')}
          className={`px-2 py-0.5 rounded text-[11px] transition-colors ${theme === 'pitch' ? 'text-white bg-neutral-800 font-medium' : 'text-neutral-400 hover:text-white'}`}
        >
          Black
        </button>

        <div className="h-3.5 w-px bg-neutral-800 mx-1" />

        {/* Camera Angles */}
        <button
          onClick={() => handleResetCamera('perspective')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-400 hover:text-white transition-colors"
        >
          3D
        </button>

        <button
          onClick={() => handleResetCamera('front')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-400 hover:text-white transition-colors"
        >
          Front
        </button>

        <button
          onClick={() => handleResetCamera('top')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-400 hover:text-white transition-colors"
        >
          Top
        </button>
      </div>

      {/* Top Right Quick Export Buttons - Solid Minimal Flat */}
      <div className="absolute top-3 right-3 flex items-center space-x-2 z-10 text-xs">
        <button
          onClick={handleExportGLB}
          disabled={!currentModelRef.current}
          className="flex items-center space-x-1.5 bg-white hover:bg-neutral-200 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-neutral-950 px-2.5 py-1.5 rounded-md font-medium transition-colors"
          title="Export 3D Model to .GLB binary"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export GLB</span>
        </button>

        <button
          onClick={handleDownloadCode}
          disabled={!(typeof code === 'string' && code.trim())}
          className="flex items-center space-x-1.5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-900/50 disabled:text-neutral-600 disabled:cursor-not-allowed text-neutral-200 border border-neutral-800 px-2.5 py-1.5 rounded-md font-medium transition-colors"
          title="Download TypeScript code file"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Code (.ts)</span>
        </button>
      </div>

      {/* Bottom Floating Stats Bar */}
      <div className="absolute bottom-3 left-3 flex items-center space-x-2.5 bg-neutral-900/90 px-2.5 py-1 rounded-md border border-neutral-800 text-[11px] text-neutral-400 z-10 font-mono">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>{fps} FPS</span>
        </div>
        <span className="text-neutral-600">/</span>
        <span>{polyCount.toLocaleString()} Polys</span>
        <span className="text-neutral-600">/</span>
        <span>Session: {sessionId || 'unset'}</span>
      </div>
    </div>
  );
};
