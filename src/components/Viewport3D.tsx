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
  RotateCcw,
  Film
} from 'lucide-react';

interface Viewport3DProps {
  code: string;
  sessionId: string;
  uiTheme?: 'light' | 'dark';
  activeAnimation?: string | null;
  onSelectAnimation?: (name: string) => void;
  onAnimationsDetected?: (names: string[], defaultName: string | null) => void;
  onCodeError?: (error: string | null) => void;
  onExportGlb?: () => void;
}

export function formatAnimationLabel(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const ANIM_SPEEDS = [0.5, 1, 1.5, 2] as const;

type BackdropPresetId = 'light' | 'light-neutral' | 'white' | 'dark' | 'neutral' | 'pitch';

const BACKDROP_PRESETS: Record<
  BackdropPresetId,
  { label: string; color: number; gridCenter: number; gridLines: number }
> = {
  light: { label: 'Light', color: 0xf4f4f5, gridCenter: 0xa1a1aa, gridLines: 0xd4d4d8 },
  'light-neutral': { label: 'Neutral', color: 0xe4e4e7, gridCenter: 0x71717a, gridLines: 0xc4c4cc },
  white: { label: 'White', color: 0xffffff, gridCenter: 0xa1a1aa, gridLines: 0xe4e4e7 },
  dark: { label: 'Dark', color: 0x09090b, gridCenter: 0x3f3f46, gridLines: 0x202024 },
  neutral: { label: 'Neutral', color: 0x121215, gridCenter: 0x3f3f46, gridLines: 0x202024 },
  pitch: { label: 'Black', color: 0x000000, gridCenter: 0x3f3f46, gridLines: 0x202024 },
};

const LIGHT_BACKDROP_IDS: BackdropPresetId[] = ['light', 'light-neutral', 'white'];
const DARK_BACKDROP_IDS: BackdropPresetId[] = ['dark', 'neutral', 'pitch'];

export const Viewport3D: React.FC<Viewport3DProps> = ({
  code,
  sessionId,
  uiTheme = 'dark',
  activeAnimation: controlledAnimation,
  onSelectAnimation,
  onAnimationsDetected,
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

  // Animation engine refs (avoid stale closures in requestAnimationFrame loop)
  const isPlayingRef = useRef<boolean>(true);
  const animSpeedRef = useRef<number>(1);
  const animElapsedRef = useRef<number>(0);
  const activeAnimationRef = useRef<string | null>(null);
  const namedTickMapRef = useRef<Record<string, (delta: number, elapsed: number) => void>>({});
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const mixerActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const restPoseRef = useRef<
    Map<THREE.Object3D, { pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }>
  >(new Map());

  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [animSpeed, setAnimSpeed] = useState<number>(1);
  const [animationsList, setAnimationsList] = useState<string[]>([]);
  const [internalAnimation, setInternalAnimation] = useState<string | null>(null);
  const [theme, setTheme] = useState<BackdropPresetId>(() =>
    uiTheme === 'light' ? 'light' : 'dark'
  );
  const [polyCount, setPolyCount] = useState(0);
  const [fps, setFps] = useState(60);

  const activeAnimation = controlledAnimation !== undefined ? controlledAnimation : internalAnimation;

  const restoreRestPose = useCallback(() => {
    restPoseRef.current.forEach((pose, obj) => {
      obj.position.copy(pose.pos);
      obj.rotation.copy(pose.rot);
      obj.scale.copy(pose.scale);
    });
  }, []);

  const handleSelectAnimation = useCallback(
    (name: string) => {
      setInternalAnimation(name);
      onSelectAnimation?.(name);
      setIsPlaying(true);
    },
    [onSelectAnimation]
  );

  // Keep animation control refs synced with React state
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    animSpeedRef.current = animSpeed;
  }, [animSpeed]);

  // Apply animation switch cleanly (rest pose + mixer crossfade + userData.setAnimation)
  useEffect(() => {
    activeAnimationRef.current = activeAnimation ?? null;
    animElapsedRef.current = 0;

    if (!activeAnimation || !currentModelRef.current) return;

    const actions = mixerActionsRef.current;
    if (actions[activeAnimation]) {
      Object.entries(actions).forEach(([key, action]) => {
        if (key !== activeAnimation) {
          action.fadeOut(0.2);
        }
      });
      actions[activeAnimation].reset().fadeIn(0.2).play();
    } else {
      restoreRestPose();
      if (typeof currentModelRef.current.userData?.setAnimation === 'function') {
        try {
          currentModelRef.current.userData.setAnimation(activeAnimation);
        } catch {
          // ignore custom switcher errors
        }
      }
    }
  }, [activeAnimation, restoreRestPose]);

  const activeBackdropIds = uiTheme === 'light' ? LIGHT_BACKDROP_IDS : DARK_BACKDROP_IDS;

  /**
   * Initializes Three.js Scene, Camera, Renderer, Lights, Controls
   */
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const initialPreset = BACKDROP_PRESETS[theme] ?? BACKDROP_PRESETS.dark;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(initialPreset.color);
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

    // 6. Grid Helper (Flat Neutral matching backdrop)
    const gridHelper = new THREE.GridHelper(
      14,
      28,
      initialPreset.gridCenter,
      initialPreset.gridLines
    );
    gridHelper.position.y = -0.01;
    gridHelper.visible = showGrid;
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

      // Execute active model animation (AnimationMixer clips, named procedural animation, or legacy tick)
      if (isPlayingRef.current && currentModelRef.current) {
        const clampedDt = Math.min(Math.max(dt, 0), 0.1);
        const scaledDt = clampedDt * animSpeedRef.current;
        animElapsedRef.current += scaledDt;

        try {
          const activeName = activeAnimationRef.current;
          if (mixerRef.current && activeName && mixerActionsRef.current[activeName]) {
            mixerRef.current.update(scaledDt);
          } else if (activeName && namedTickMapRef.current[activeName]) {
            namedTickMapRef.current[activeName](scaledDt, animElapsedRef.current);
          } else if (typeof currentModelRef.current.userData?.tick === 'function') {
            currentModelRef.current.userData.tick(scaledDt, animElapsedRef.current);
          } else if (typeof currentModelRef.current.userData?.update === 'function') {
            currentModelRef.current.userData.update(scaledDt, animElapsedRef.current);
          }
        } catch (e) {
          // suppress runtime animation errors
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
   * Sync viewport backdrop with global Light/Dark UI theme
   */
  useEffect(() => {
    setTheme(uiTheme === 'light' ? 'light' : 'dark');
  }, [uiTheme]);

  /**
   * Updates Solid Background (No Gradients) & Grid Helper palette
   */
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const preset = BACKDROP_PRESETS[theme] ?? BACKDROP_PRESETS.dark;
    scene.background = new THREE.Color(preset.color);

    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current.geometry.dispose();
      if (Array.isArray(gridHelperRef.current.material)) {
        gridHelperRef.current.material.forEach((m) => m.dispose());
      } else {
        gridHelperRef.current.material.dispose();
      }
    }

    const nextGrid = new THREE.GridHelper(14, 28, preset.gridCenter, preset.gridLines);
    nextGrid.position.y = -0.01;
    nextGrid.visible = showGrid;
    scene.add(nextGrid);
    gridHelperRef.current = nextGrid;
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
      // Clean up previous model & animation mixer
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      mixerActionsRef.current = {};
      namedTickMapRef.current = {};
      restPoseRef.current.clear();
      animElapsedRef.current = 0;

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

      // When code is empty (no demo), reset polycount, animations and clear error
      if (!safeCode.trim()) {
        setPolyCount(0);
        setAnimationsList([]);
        setInternalAnimation(null);
        activeAnimationRef.current = null;
        onAnimationsDetected?.([], null);
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

      // Snapshot rest poses before any animation runs so switching animations stays clean
      model.traverse((obj) => {
        restPoseRef.current.set(obj, {
          pos: obj.position.clone(),
          rot: obj.rotation.clone(),
          scale: obj.scale.clone(),
        });
      });

      // Discover available animations from the generated model
      const detectedNames: string[] = [];
      const detectedSet = new Set<string>();
      const addDetected = (name: string) => {
        const clean = name.trim();
        if (clean && !detectedSet.has(clean)) {
          detectedSet.add(clean);
          detectedNames.push(clean);
        }
      };

      // Pattern A: Named procedural animation functions in userData.animations = { idle: fn, walk: fn, ... }
      const rawUserAnims = model.userData?.animations;
      if (rawUserAnims && typeof rawUserAnims === 'object' && !Array.isArray(rawUserAnims)) {
        for (const [animName, fn] of Object.entries(rawUserAnims)) {
          if (typeof fn === 'function') {
            namedTickMapRef.current[animName] = fn as (delta: number, elapsed: number) => void;
            addDetected(animName);
          }
        }
      }

      // Pattern B: Three.js AnimationClip[] on model.animations, userData.clips, or array userData.animations
      const clipSources: unknown[] = [
        ...(Array.isArray(model.animations) ? model.animations : []),
        ...(Array.isArray(model.userData?.clips) ? model.userData.clips : []),
        ...(Array.isArray(rawUserAnims) ? rawUserAnims : []),
      ];
      const validClips = clipSources.filter(
        (c): c is THREE.AnimationClip => c instanceof THREE.AnimationClip
      );
      if (validClips.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        validClips.forEach((clip, idx) => {
          const clipName = clip.name?.trim() || `Animation ${idx + 1}`;
          mixerActionsRef.current[clipName] = mixer.clipAction(clip);
          addDetected(clipName);
        });
      }

      // Pattern C: Custom animationNames + setAnimation(name) + tick
      if (Array.isArray(model.userData?.animationNames)) {
        for (const item of model.userData.animationNames) {
          if (typeof item === 'string') addDetected(item);
        }
      }

      // Pattern D: Fallback single anonymous tick / update
      if (
        detectedNames.length === 0 &&
        (typeof model.userData?.tick === 'function' || typeof model.userData?.update === 'function')
      ) {
        addDetected('Default');
      }

      // Pick initial active animation
      const requestedDefault =
        typeof model.userData?.defaultAnimation === 'string'
          ? model.userData.defaultAnimation
          : null;
      const idleMatch = detectedNames.find((n) => n.toLowerCase() === 'idle');
      const initialAnim =
        requestedDefault && detectedSet.has(requestedDefault)
          ? requestedDefault
          : idleMatch || detectedNames[0] || null;

      setPolyCount(Math.round(totalTris));
      scene.add(model);
      currentModelRef.current = model;

      setAnimationsList(detectedNames);
      setInternalAnimation(initialAnim);
      activeAnimationRef.current = initialAnim;
      onAnimationsDetected?.(detectedNames, initialAnim);

      // Start initial AnimationClip action or setAnimation hook immediately
      if (initialAnim) {
        if (mixerActionsRef.current[initialAnim]) {
          mixerActionsRef.current[initialAnim].reset().play();
        } else if (typeof model.userData?.setAnimation === 'function') {
          try {
            model.userData.setAnimation(initialAnim);
          } catch {
            // ignore
          }
        }
      }

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

    try {
      // Temporarily stash node userData while cloning so non-serializable / circular refs
      // (e.g. animation functions or rig references) cannot throw inside Object3D.copy()
      const savedUserData = new Map<THREE.Object3D, Record<string, any>>();
      let exportRoot: THREE.Object3D;
      try {
        currentModelRef.current.traverse((node) => {
          savedUserData.set(node, node.userData);
          node.userData = {};
        });
        exportRoot = currentModelRef.current.clone(true);
      } finally {
        savedUserData.forEach((ud, node) => {
          node.userData = ud;
        });
      }

      // Sanitize materials so custom ShaderMaterials become standard glTF PBR materials
      exportRoot.traverse((node) => {
        node.userData = {};
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          const safeCloneMat = (sourceMat: THREE.Material): THREE.Material => {
            const origUd = sourceMat.userData;
            try {
              sourceMat.userData = {};
              const cloned = sourceMat.clone();
              cloned.userData = {};
              return cloned;
            } finally {
              sourceMat.userData = origUd;
            }
          };

          const convertMat = (mat: THREE.Material): THREE.Material => {
            if (mat.userData?.gltfMaterial instanceof THREE.Material) {
              return safeCloneMat(mat.userData.gltfMaterial);
            }
            if ((mat as THREE.ShaderMaterial).isShaderMaterial) {
              const converted = convertShaderMaterialToStandard(mat as THREE.ShaderMaterial);
              converted.userData = {};
              return converted;
            }
            return safeCloneMat(mat);
          };

          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material.map(convertMat);
          } else if (mesh.material) {
            mesh.material = convertMat(mesh.material);
          }
        }
      });

      const exportAnimations = Array.isArray(currentModelRef.current.animations)
        ? currentModelRef.current.animations.filter(
            (clip): clip is THREE.AnimationClip => clip instanceof THREE.AnimationClip
          )
        : [];

      const exporter = new GLTFExporter();
      exporter.parse(
        exportRoot,
        (gltf) => {
          const blob = new Blob([gltf as ArrayBuffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(currentModelRef.current?.name || 'model').replace(/[^a-zA-Z0-9._-]/g, '_')}.glb`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        (error) => {
          console.error('GLTF Export error:', error);
          onCodeError?.(`GLB export failed: ${error?.message || String(error)}`);
        },
        {
          binary: true,
          animations: exportAnimations,
        }
      );
    } catch (err: any) {
      console.error('GLTF Export error:', err);
      onCodeError?.(`GLB export failed: ${err?.message || String(err)}`);
    }
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
    <div className="relative w-full h-full flex flex-col bg-neutral-100 dark:bg-neutral-950 overflow-hidden select-none transition-colors">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Empty State Overlay when no model is loaded (no demo) */}
      {!(typeof code === 'string' && code.trim()) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-neutral-500 space-y-3 z-0">
          <div className="w-12 h-12 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white/90 dark:bg-neutral-900/60 flex items-center justify-center text-neutral-600 dark:text-neutral-400">
            <Box className="w-6 h-6 stroke-[1.5]" />
          </div>
          <div className="text-center space-y-1">
            <div className="text-sm font-medium text-neutral-800 dark:text-neutral-300">Ready to Sculpt</div>
            <div className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              Connect an AI agent to generate procedural Three.js models, or paste code into the editor.
            </div>
          </div>
        </div>
      )}

      {/* Top Floating Viewport Toolbar - Minimal, Flat */}
      <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-white/95 dark:bg-neutral-900/95 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 z-10 text-xs transition-colors">
        <button
          onClick={() => setShowGrid(!showGrid)}
          title="Toggle Grid"
          className={`p-1.5 rounded transition-colors ${
            showGrid
              ? 'text-neutral-950 bg-neutral-200 dark:text-white dark:bg-neutral-800'
              : 'text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setWireframe(!wireframe)}
          title="Toggle Wireframe"
          className={`p-1.5 rounded transition-colors ${
            wireframe
              ? 'text-neutral-950 bg-neutral-200 dark:text-white dark:bg-neutral-800'
              : 'text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause Animation' : 'Play Animation'}
          className={`p-1.5 rounded transition-colors ${
            isPlaying
              ? 'text-neutral-900 dark:text-neutral-200'
              : 'text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300'
          }`}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </button>

        <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />

        {/* Backdrop Presets (Solid Flat Colors matched to Light / Dark UI Mode) */}
        {activeBackdropIds.map((presetId) => (
          <button
            key={presetId}
            onClick={() => setTheme(presetId)}
            className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
              theme === presetId
                ? 'text-neutral-950 bg-neutral-200 dark:text-white dark:bg-neutral-800 font-medium'
                : 'text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white'
            }`}
          >
            {BACKDROP_PRESETS[presetId].label}
          </button>
        ))}

        <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800 mx-1" />

        {/* Camera Angles */}
        <button
          onClick={() => handleResetCamera('perspective')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
        >
          3D
        </button>

        <button
          onClick={() => handleResetCamera('front')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
        >
          Front
        </button>

        <button
          onClick={() => handleResetCamera('top')}
          className="px-2 py-0.5 rounded text-[11px] text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-white transition-colors"
        >
          Top
        </button>
      </div>

      {/* Top Right Quick Export Buttons - Solid Minimal Flat */}
      <div className="absolute top-3 right-3 flex items-center space-x-2 z-10 text-xs">
        <button
          onClick={handleExportGLB}
          disabled={!currentModelRef.current}
          className="flex items-center space-x-1.5 bg-neutral-950 hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 dark:bg-white dark:hover:bg-neutral-200 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500 disabled:cursor-not-allowed text-white dark:text-neutral-950 px-2.5 py-1.5 rounded-md font-medium transition-colors"
          title="Export 3D Model to .GLB binary"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export GLB</span>
        </button>

        <button
          onClick={handleDownloadCode}
          disabled={!(typeof code === 'string' && code.trim())}
          className="flex items-center space-x-1.5 bg-white hover:bg-neutral-100 disabled:bg-neutral-100 disabled:text-neutral-400 text-neutral-800 border border-neutral-200 dark:bg-neutral-900 dark:hover:bg-neutral-800 dark:disabled:bg-neutral-900/50 dark:disabled:text-neutral-600 disabled:cursor-not-allowed dark:text-neutral-200 dark:border-neutral-800 px-2.5 py-1.5 rounded-md font-medium transition-colors"
          title="Download TypeScript code file"
        >
          <FileCode2 className="w-3.5 h-3.5" />
          <span>Code (.ts)</span>
        </button>
      </div>

      {/* Bottom Floating Stats Bar */}
      <div className="absolute bottom-3 left-3 flex items-center space-x-2.5 bg-white/95 dark:bg-neutral-900/90 px-2.5 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-400 z-10 font-mono transition-colors">
        <div className="flex items-center space-x-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
          <span>{fps} FPS</span>
        </div>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span>{polyCount.toLocaleString()} Polys</span>
        <span className="text-neutral-300 dark:text-neutral-600">/</span>
        <span>Session: {sessionId || 'unset'}</span>
      </div>

      {/* Bottom Right Floating Animations Selector Bar (Solid Flat Light / Dark) */}
      {animationsList.length > 0 && (
        <div className="absolute bottom-3 right-3 max-w-[58%] flex flex-wrap items-center justify-end gap-1.5 bg-white/95 dark:bg-neutral-900/95 px-2.5 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-[11px] z-10 transition-colors">
          <div className="flex items-center space-x-1 text-neutral-500 dark:text-neutral-400 pr-1">
            <Film className="w-3 h-3" />
            <span className="font-medium text-[10px]">Animations</span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {animationsList.map((animName) => {
              const isSelected = activeAnimation === animName;
              return (
                <button
                  key={animName}
                  type="button"
                  onClick={() => handleSelectAnimation(animName)}
                  className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                    isSelected
                      ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 font-medium'
                      : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  {formatAnimationLabel(animName)}
                </button>
              );
            })}
          </div>

          <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800 mx-0.5" />

          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? 'Pause Animation' : 'Play Animation'}
            className="p-1 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-200 transition-colors"
          >
            {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          </button>

          <button
            type="button"
            onClick={() => {
              const idx = ANIM_SPEEDS.indexOf(animSpeed as (typeof ANIM_SPEEDS)[number]);
              setAnimSpeed(ANIM_SPEEDS[(idx + 1) % ANIM_SPEEDS.length]);
            }}
            title="Cycle Animation Speed"
            className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-neutral-100 hover:bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300 transition-colors"
          >
            {animSpeed}x
          </button>
        </div>
      )}
    </div>
  );
};
