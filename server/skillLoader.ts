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

/**
 * Loads and indexes all Three.js skills from the local skills/ directory.
 */
export function getAllSkills(): Map<string, ThreeJsSkill> {
  if (cachedSkills) return cachedSkills;

  cachedSkills = new Map();

  if (!fs.existsSync(SKILLS_DIR)) {
    console.warn(`[skills] Warning: Skills directory not found at ${SKILLS_DIR}`);
    return cachedSkills;
  }

  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    if (!fs.existsSync(skillPath)) continue;

    try {
      const content = fs.readFileSync(skillPath, 'utf-8');
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

      let name = dir.name;
      let description = '';
      let body = content;

      if (frontmatterMatch) {
        const yaml = frontmatterMatch[1];
        body = frontmatterMatch[2];

        const nameMatch = yaml.match(/name:\s*(.+)/);
        if (nameMatch) name = nameMatch[1].trim();

        const descMatch = yaml.match(/description:\s*(?:"([^"]+)"|'([^']+)'|([^\n]+))/);
        if (descMatch) description = (descMatch[1] || descMatch[2] || descMatch[3] || '').trim();
      }

      // Determine category
      let category = 'Core';
      if (dir.name.includes('geometry')) category = 'Geometry';
      else if (dir.name.includes('material')) category = 'Materials';
      else if (dir.name.includes('shader')) category = 'Shaders';
      else if (dir.name.includes('texture')) category = 'Textures';
      else if (dir.name.includes('light')) category = 'Lighting';
      else if (dir.name.includes('anim')) category = 'Animation';
      else if (dir.name.includes('perf')) category = 'Performance';

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

/**
 * Selects the most relevant skills based on user prompt and procedural modeling requirements.
 */
export function getRelevantSkills(userPrompt: string): { skills: ThreeJsSkill[]; names: string[] } {
  const all = getAllSkills();
  const selected = new Map<string, ThreeJsSkill>();

  // Baseline skills always essential for procedural 3D sculpture
  const baseline = ['threejs-geometry', 'threejs-materials', 'threejs-textures', 'threejs-animation', 'threejs-performance'];
  for (const id of baseline) {
    const skill = all.get(id);
    if (skill) selected.set(id, skill);
  }

  const p = userPrompt.toLowerCase();

  // Dynamic skill matching
  if (p.includes('shader') || p.includes('glsl') || p.includes('glow') || p.includes('cel') || p.includes('toon') || p.includes('anime') || p.includes('hologram') || p.includes('water')) {
    const shaderSkill = all.get('threejs-shaders');
    if (shaderSkill) selected.set('threejs-shaders', shaderSkill);
  }

  if (p.includes('light') || p.includes('shadow') || p.includes('sun') || p.includes('spot') || p.includes('lamp') || p.includes('neon')) {
    const lightSkill = all.get('threejs-lighting');
    if (lightSkill) selected.set('threejs-lighting', lightSkill);
  }

  if (p.includes('particle') || p.includes('point') || p.includes('cloud') || p.includes('stars')) {
    const geomSkill = all.get('threejs-geometry');
    if (geomSkill) selected.set('threejs-geometry', geomSkill);
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
export function buildEnrichedSystemPrompt(userPrompt: string): { prompt: string; appliedSkills: string[] } {
  const { skills, names } = getRelevantSkills(userPrompt);

  const skillsKnowledge = skills
    .map((s) => `#### Skill Module: ${s.name} (${s.id})\n${s.keyDirectives}`)
    .join('\n\n---\n\n');

  const fullPrompt = `
You are an expert Three.js procedural 3D artist and software engineer.
You are powered by the official CloudAI-X/threejs-skills knowledge library.
You MUST follow the verified patterns, API conventions, and best practices from these skills to generate the 3D model.

### APPLIED SKILLS MODULES:
${names.map((n) => `- ${n}`).join('\n')}

### SKILLS DIRECTIVES & PATTERNS:
${skillsKnowledge}

### CORE SCULPTING RULES:
1. CODE ONLY: Reconstruct the object purely from procedural Three.js primitives, custom BufferGeometries, procedural CanvasTextures, and shader materials. NO external .gltf/.glb files, external image URLs, or downloaded art packs.
2. RUNTIME EXPORT FUNCTION:
   Output a single exported function:
   \`\`\`typescript
   import * as THREE from 'three';

   export function createModel(): THREE.Group {
     const root = new THREE.Group();
     root.name = 'sculpted-model';

     // 1. Procedural Geometries (curves, tubes, primitives, buffer attributes)
     // 2. Procedural Materials (Standard, Physical, Toon, or ShaderMaterial)
     // 3. Procedural CanvasTextures for high-res surface detail
     // 4. Object Hierarchy with castShadow and receiveShadow
     
     // 5. Looping Animation Loop
     root.userData.tick = (delta: number, elapsed: number) => {
       // subtle idle breathing, rotation, wind sway, or mechanical movement
     };

     return root;
   }
   \`\`\`
3. DETAIL ACCURACY:
   - Identify identity-defining details: bevels, chamfers, panel seams, fasteners, surface wear, gloss vs matte zones.
   - PBR Materials: Use MeshStandardMaterial or MeshPhysicalMaterial with roughness, metalness, clearcoat, or procedural CanvasTextures.
   - Stylized/Anime Models: Use custom shaders, spherical normals, or vertex colors with high-contrast cel-shaded bands.
4. SHADOWS & LIGHTING:
   - Mark meshes with \`mesh.castShadow = true\` and \`mesh.receiveShadow = true\`.
5. PROCEDURAL TEXTURES (CanvasTexture):
   - When textures are needed (wood grain, bark, leaves, metal panels, computer screens, cloth), generate them procedurally using an in-memory HTML5 Canvas and \`new THREE.CanvasTexture(canvas)\`.
6. RETURN FORMAT:
   - Return ONLY clean, executable TypeScript/JavaScript code inside a \`\`\`typescript code block, followed by a brief bulleted breakdown of which Three.js skills you applied.
`;

  return { prompt: fullPrompt, appliedSkills: names };
}
