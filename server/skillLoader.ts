import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ThreeJsSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  markdown: string;
  keyDirectives: string;
}

function resolveSkillsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'skills'),
    path.resolve(__dirname, '../skills'),
    path.resolve(__dirname, '../../skills'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

const SKILLS_DIR = resolveSkillsDir();

let cachedSkills: Map<string, ThreeJsSkill> | null = null;
let cachedDirMtimeMs = 0;

/**
 * Parses single-line or multi-line YAML frontmatter description (including `>` / `|` block scalars).
 */
function parseFrontmatterDescription(yaml: string): string {
  const blockMatch = yaml.match(/^description:\s*[>|][+-]?\s*\n((?:[ \t]+.*\n?)+)/m);
  if (blockMatch) {
    return blockMatch[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  const singleMatch = yaml.match(/^description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/m);
  if (singleMatch) {
    return (singleMatch[1] || singleMatch[2] || singleMatch[3] || '').trim();
  }

  return '';
}

/**
 * Loads and indexes all Three.js skills from the local skills/ directory.
 * Automatically reloads if the skills directory has been modified on disk.
 */
export function getAllSkills(forceReload: boolean = false): Map<string, ThreeJsSkill> {
  if (!fs.existsSync(SKILLS_DIR)) {
    console.warn(`[skills] Warning: Skills directory not found at ${SKILLS_DIR}`);
    cachedSkills = new Map();
    return cachedSkills;
  }

  let currentMtimeMs = 0;
  try {
    currentMtimeMs = fs.statSync(SKILLS_DIR).mtimeMs;
  } catch {
    // ignore stat errors
  }

  if (!forceReload && cachedSkills && currentMtimeMs === cachedDirMtimeMs) {
    return cachedSkills;
  }

  cachedSkills = new Map();
  cachedDirMtimeMs = currentMtimeMs;

  const dirs = fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of dirs) {
    const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const frontmatterMatch = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);

      let name = dir.name;
      let description = '';
      let body = content;

      if (frontmatterMatch) {
        const yaml = frontmatterMatch[1];
        body = frontmatterMatch[2];

        const nameMatch = yaml.match(/^name:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/m);
        if (nameMatch) name = (nameMatch[1] || nameMatch[2] || nameMatch[3] || dir.name).trim();

        description = parseFrontmatterDescription(yaml);
      }

      if (!description) {
        const fallbackLine = body
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 20 && !l.startsWith('#') && !l.startsWith('```') && !l.startsWith('---'));
        if (fallbackLine) description = fallbackLine.slice(0, 180);
      }

      // Determine category
      let category = 'Core';
      const idLower = dir.name.toLowerCase();
      if (idLower.includes('procedural') || idLower.includes('sculptor') || idLower.includes('img2threejs') || idLower.includes('vegetation') || idLower.includes('creature') || idLower.includes('building') || idLower.includes('planet')) category = 'Procedural';
      else if (idLower.includes('r3f') || idLower.includes('react-three-fiber') || idLower.includes('drei')) category = 'React Three Fiber';
      else if (idLower.includes('webgpu') || idLower.includes('tsl')) category = 'WebGPU';
      else if (idLower.includes('shader') || idLower.includes('glsl')) category = 'Shaders';
      else if (idLower.includes('geometry') || idLower.includes('geometries')) category = 'Geometry';
      else if (idLower.includes('material')) category = 'Materials';
      else if (idLower.includes('texture')) category = 'Textures';
      else if (idLower.includes('light') || idLower.includes('shadow') || idLower.includes('sky') || idLower.includes('skies') || idLower.includes('cloud') || idLower.includes('ocean') || idLower.includes('water') || idLower.includes('weather')) category = 'Lighting & Environment';
      else if (idLower.includes('anim') || idLower.includes('motion')) category = 'Animation';
      else if (idLower.includes('particle')) category = 'Particles & VFX';
      else if (idLower.includes('postproc') || idLower.includes('post-proc') || idLower.includes('bloom') || idLower.includes('exposure') || idLower.includes('image-pipeline')) category = 'Post-Processing';
      else if (idLower.includes('physics')) category = 'Physics';
      else if (idLower.includes('game')) category = 'Games';
      else if (idLower.includes('xr') || idLower.includes('spatial') || idLower.includes('ifc') || idLower.includes('sparkjs') || idLower.includes('audio')) category = 'XR & Spatial';
      else if (idLower.includes('debug') || idLower.includes('error') || idLower.includes('test') || idLower.includes('qa') || idLower.includes('valid')) category = 'Debugging & QA';
      else if (idLower.includes('perf') || idLower.includes('best-practices')) category = 'Performance';
      else if (idLower.includes('load') || idLower.includes('asset') || idLower.includes('optimizer')) category = 'Assets & Loaders';
      else if (idLower.includes('interact') || idLower.includes('control') || idLower.includes('camera') || idLower.includes('raycast')) category = 'Interaction & Camera';

      // Extract key instructions and code patterns
      const keyDirectives = extractKeyDirectives(dir.name, body);

      cachedSkills.set(dir.name, {
        id: dir.name,
        name,
        description,
        category,
        markdown: body,
        keyDirectives,
      });
    } catch (err) {
      console.error(`[skills] Failed to parse skill in ${dir.name}:`, err);
    }
  }

  console.log(`[skills] Indexed ${cachedSkills.size} Three.js skills from ${SKILLS_DIR}`);
  return cachedSkills;
}

/**
 * Extracts essential code recipes and directives for compact, high-impact prompt injection.
 */
function extractKeyDirectives(skillId: string, body: string): string {
  // Extract code snippets and bulleted directives
  const codeBlocks: string[] = [];
  const regex = /```(?:javascript|typescript|js|ts|glsl)\s*([\s\S]*?)```/g;
  let match;
  let count = 0;

  while ((match = regex.exec(body)) !== null && count < 3) {
    const code = match[1].trim();
    if (code.length > 30 && code.length < 800) {
      codeBlocks.push(code);
      count++;
    }
  }

  // Extract primary guidelines (first 30 lines of markdown)
  const lines = body
    .split('\n')
    .filter((l) => l.startsWith('#') || l.startsWith('-') || l.startsWith('*'))
    .slice(0, 10)
    .join('\n');

  return `### SKILL: ${skillId}\n${lines}\n${codeBlocks.length > 0 ? '```typescript\n' + codeBlocks.join('\n\n') + '\n```' : ''}`;
}

const QUERY_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'onto', 'over', 'under', 'like',
  'more', 'most', 'very', 'just', 'make', 'create', 'build', 'generate', 'design', 'model',
  'object', 'asset', 'scene', 'three', 'threejs', '3d', 'image', 'picture', 'photo', 'reference',
  'strictly', 'accurate', 'accurately', 'exactly', 'realistic', 'stylized', 'please', 'using',
  'want', 'need', 'should', 'would', 'could', 'have', 'has', 'are', 'was', 'were', 'been',
  'being', 'also', 'some', 'such', 'than', 'then', 'them', 'they', 'their', 'there', 'here',
  'when', 'where', 'what', 'which', 'who', 'how', 'can', 'will', 'all', 'any', 'but', 'not',
  'you', 'your', 'our', 'its', 'out', 'off', 'add', 'give', 'show', 'look', 'looks', 'looking',
]);

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWordMatch(haystack: string, term: string): boolean {
  if (!term) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, 'i').test(haystack);
}

/**
 * Selects the most relevant skills based on user prompt/topic and procedural modeling requirements.
 * Scores all installed skills by word-boundary matches on id, name, category, and description.
 */
export function getRelevantSkills(
  userPrompt: string,
  maxSkills: number = 8,
  hasImage: boolean = false
): { skills: ThreeJsSkill[]; names: string[] } {
  const all = getAllSkills();
  const query = (userPrompt || '').trim().toLowerCase();

  // Exact ID match first (useful when MCP callers query a specific skill id)
  const exact = all.get(query);
  if (exact) {
    return { skills: [exact], names: [exact.id] };
  }

  const rawTerms = query
    .split(/[^a-z0-9-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !QUERY_STOPWORDS.has(t));

  // Deduplicate query terms
  const terms = Array.from(new Set(rawTerms));

  // Score every installed skill against meaningful domain terms using whole-word matching
  const scored: { skill: ThreeJsSkill; score: number }[] = [];
  for (const skill of all.values()) {
    let score = 0;
    const idL = skill.id.toLowerCase();
    const nameL = skill.name.toLowerCase();
    const catL = skill.category.toLowerCase();
    const descL = skill.description.toLowerCase();

    if (query.length >= 4 && !QUERY_STOPWORDS.has(query) && idL.includes(query)) score += 20;

    for (const term of terms) {
      if (hasWordMatch(idL, term)) score += 10;
      if (hasWordMatch(nameL, term)) score += 8;
      if (hasWordMatch(catL, term)) score += 5;
      if (hasWordMatch(descL, term)) score += 3;
    }

    if (score > 0) {
      scored.push({ skill, score });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id));

  const selected = new Map<string, ThreeJsSkill>();

  // When a reference image is provided, prioritize procedural image-to-3D sculpting skills first
  if (hasImage) {
    for (const id of ['threejs-object-sculptor', 'img2threejs']) {
      const s = all.get(id);
      if (s) selected.set(id, s);
    }
  }

  // Always include core procedural baseline skills for reliable Three.js generation
  const baseline = ['threejs-geometry', 'threejs-materials', 'threejs-textures', 'threejs-animation'];
  for (const id of baseline) {
    if (selected.size >= maxSkills) break;
    const skill = all.get(id);
    if (skill && !selected.has(id)) {
      selected.set(id, skill);
    }
  }

  // Fill remaining slots with top domain-matched skills
  for (const item of scored) {
    if (selected.size >= maxSkills) break;
    if (!selected.has(item.skill.id)) {
      selected.set(item.skill.id, item.skill);
    }
  }

  // Fill with performance skill if room remains
  if (selected.size < maxSkills) {
    const perf = all.get('threejs-performance');
    if (perf && !selected.has(perf.id)) selected.set(perf.id, perf);
  }

  const result = Array.from(selected.values());
  return {
    skills: result,
    names: result.map((s) => s.id),
  };
}

/**
 * Builds the comprehensive, skill-enriched prompt injected into every AI agent request.
 */
export function buildEnrichedSystemPrompt(
  userPrompt: string,
  hasImage: boolean = false
): { prompt: string; appliedSkills: string[] } {
  const { skills, names } = getRelevantSkills(userPrompt, 7, hasImage);

  const skillsKnowledge = skills
    .map((s) => `#### Skill Module: ${s.name} (${s.id})\n${s.keyDirectives}`)
    .join('\n\n---\n\n');

  const fullPrompt = `
You are an expert Three.js procedural 3D artist and software engineer.
You are powered by a curated Three.js skills knowledge library.
You MUST follow the verified patterns, API conventions, and best practices from these skills to generate the 3D model.

### APPLIED SKILLS MODULES:
${names.map((n) => `- ${n}`).join('\n')}

### SKILLS DIRECTIVES & PATTERNS:
${skillsKnowledge}

### CORE SCULPTING RULES:
1. CODE ONLY & PURE GLTF 2.0 PBR COMPLIANCE (MARKETPLACE & SKETCHFAB READY):
   - Reconstruct the object purely from procedural Three.js primitives, custom BufferGeometries, and procedural CanvasTextures. NO external .gltf/.glb files or downloaded assets.
   - STRICT PBR MATERIALS: Use THREE.MeshStandardMaterial or THREE.MeshPhysicalMaterial with explicit color, roughness, metalness, and procedural CanvasTextures.
   - FORBIDDEN: Strictly DO NOT use THREE.ShaderMaterial, RawShaderMaterial, or custom inline GLSL fragment/vertex shaders. External glTF viewers (Sketchfab, Blender, Unity, Unreal Engine) cannot execute custom GLSL shaders, causing models to turn pitch black or fail.
   - FORBIDDEN: Strictly DO NOT generate inverted-hull outline meshes (side: THREE.BackSide). In standard glTF viewers, inverted hulls export as duplicate black shells that occlude real body panels.
   - FORBIDDEN: Do not generate solid cone/cylinder geometry meshes for light beams, flares, or ground glow planes; glTF exports them as solid grey obstruction geometry.
2. RUNTIME EXPORT FUNCTION & NAMED ANIMATIONS:
   Output a single exported function:
   \`\`\`typescript
   import * as THREE from 'three';

   export function createModel(): THREE.Group {
     const root = new THREE.Group();
     root.name = 'sculpted-model';

     // 1. Procedural Geometries (curves, tubes, primitives, buffer attributes)
     // 2. Procedural Standard PBR Materials (MeshStandardMaterial / MeshPhysicalMaterial)
     // 3. Procedural CanvasTextures for decals, liveries, grain, anime stripes, surface detail
     // 4. Articulated Object Hierarchy with unique names on every pivot (wheelFL, doorLeftPivot, steeringWheel)

     // 5. Named Selectable Animations (displayed automatically in Studio UI and baked into .GLB export)
     // Whenever the user requests animations (e.g. idle, walk, drive, drift, wipers, steer, jump),
     // implement EVERY requested animation as a named function in root.userData.animations.
     // Always set transforms explicitly from rest pose values so switching animations never leaves stuck limbs.
     root.userData.animations = {
       idle: (delta: number, elapsed: number) => {
         // subtle breathing, engine idle vibration, or gentle sway
       },
       // Add every animation requested by the user
     };
     root.userData.defaultAnimation = 'idle';

     // Optional fallback tick (defaults to idle)
     root.userData.tick = (delta: number, elapsed: number) => {
       root.userData.animations.idle(delta, elapsed);
     };

     return root;
   }
   \`\`\`
3. DETAIL ACCURACY & GLTF 2.0 PBR MATERIALS:
   - Identify identity-defining details: bevels, chamfers, panel seams, fasteners, surface wear, gloss vs matte zones.
   - Automotive Paint: MeshStandardMaterial({ color: 0xffd71a, roughness: 0.22, metalness: 0.15 })
   - Chrome / Machined Metal: MeshStandardMaterial({ color: 0xe8ecf0, roughness: 0.12, metalness: 0.95 })
   - Rubber / Tires: MeshStandardMaterial({ color: 0x222226, roughness: 0.85, metalness: 0.02 })
   - Tinted Glass / Windows: MeshPhysicalMaterial({ color: 0x161c24, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.10, depthWrite: false })
   - Headlight / Taillight Lenses: MeshStandardMaterial with high emissive color for active lighting.
4. ANIMATION RIGGING & CLEAR NODE NAMING:
   - Build articulated sub-groups placed at true anatomical/mechanical joint origins.
   - CRITICAL FOR GLB EXPORT: Assign clean, descriptive names to every joint and animated group (e.g. root, wheelFL, wheelFR, wheelRL, wheelRR, steeringWheel, doorLeftPivot, doorRightPivot, wiperLeft, wiperRight, spoilerPivot).
   - The platform automatically samples root.userData.animations and bakes them into real glTF keyframe tracks (THREE.AnimationClip) so animations play natively in Sketchfab, Blender, and Unity.
5. SHADOWS & LIGHTING:
   - Mark meshes with \`mesh.castShadow = true\` and \`mesh.receiveShadow = true\`.
6. PROCEDURAL TEXTURES (CanvasTexture):
   - When decals, anime liveries, stripes, carbon-fiber, wood grain, leaves, or typography are needed, generate them procedurally using an in-memory HTML5 Canvas and \`new THREE.CanvasTexture(canvas)\`.
   - Always set \`texture.colorSpace = THREE.SRGBColorSpace;\` and \`texture.needsUpdate = true;\` so colors render accurately in WebGL and export cleanly to .glb.
7. RETURN FORMAT:
   - Return ONLY clean, executable TypeScript/JavaScript code inside a \`\`\`typescript code block, followed by a brief bulleted breakdown of the animations and Three.js skills you applied.
`;

  return { prompt: fullPrompt, appliedSkills: names };
}
