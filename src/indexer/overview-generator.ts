import { readFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { NodeData, ChildInfo } from '../mindmap/node.js';
import { createEmptyNode } from '../mindmap/node.js';

export interface AreaSummary {
  path: string;
  summary: string;
  fileCount: number;
}

export async function generateOverviewNode(
  projectRoot: string,
  areas: AreaSummary[],
  totalFiles: number,
): Promise<NodeData> {
  const projectName = await detectProjectName(projectRoot);
  const node = createEmptyNode('_overview', 'overview');
  node.projectName = projectName;
  node.filesTotal = totalFiles;

  // Detect tech stack from known files
  node.techStack = await detectTechStack(projectRoot);

  // Detect entry points
  node.entryPoints = await detectEntryPoints(projectRoot);

  // Build children from areas
  node.children = areas.map<ChildInfo>(area => ({
    path: area.path,
    summary: area.summary,
    fileCount: area.fileCount,
  }));

  // Generate summary
  const parts = [projectName];
  if (node.techStack) parts.push(`(${node.techStack})`);
  node.summary = parts.join(' ');

  return node;
}

async function detectProjectName(projectRoot: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'));
    if (pkg.name) return pkg.name;
  } catch { /* ignore */ }

  try {
    const goMod = await readFile(join(projectRoot, 'go.mod'), 'utf-8');
    const match = goMod.match(/^module\s+(.+)/m);
    if (match) {
      const parts = match[1].trim().split('/');
      return parts[parts.length - 1];
    }
  } catch { /* ignore */ }

  try {
    const pyproject = await readFile(join(projectRoot, 'pyproject.toml'), 'utf-8');
    const match = pyproject.match(/name\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch { /* ignore */ }

  return basename(projectRoot);
}

async function detectTechStack(projectRoot: string): Promise<string> {
  const techs: string[] = [];

  const checks: Array<{ file: string; tech: string; detect?: (content: string) => string[] }> = [
    { file: 'package.json', tech: '', detect: detectFromPackageJson },
    { file: 'go.mod', tech: 'Go' },
    { file: 'Cargo.toml', tech: 'Rust' },
    { file: 'pyproject.toml', tech: 'Python' },
    { file: 'requirements.txt', tech: 'Python' },
    { file: 'pom.xml', tech: 'Java' },
    { file: 'build.gradle', tech: 'Java/Kotlin' },
    { file: 'Gemfile', tech: 'Ruby' },
    { file: 'composer.json', tech: 'PHP' },
    { file: 'Dockerfile', tech: 'Docker' },
    { file: 'docker-compose.yml', tech: 'Docker' },
    { file: 'docker-compose.yaml', tech: 'Docker' },
  ];

  for (const check of checks) {
    try {
      const content = await readFile(join(projectRoot, check.file), 'utf-8');
      if (check.detect) {
        techs.push(...check.detect(content));
      } else if (check.tech) {
        techs.push(check.tech);
      }
    } catch { /* ignore */ }
  }

  return [...new Set(techs)].join(', ');
}

function detectFromPackageJson(content: string): string[] {
  const techs: string[] = [];
  try {
    const pkg = JSON.parse(content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) techs.push('TypeScript');
    if (allDeps.react) techs.push('React');
    if (allDeps.vue) techs.push('Vue');
    if (allDeps.angular || allDeps['@angular/core']) techs.push('Angular');
    if (allDeps.express) techs.push('Express');
    if (allDeps.fastify) techs.push('Fastify');
    if (allDeps.next) techs.push('Next.js');
    if (allDeps.nuxt) techs.push('Nuxt');
    if (allDeps.prisma || allDeps['@prisma/client']) techs.push('Prisma');
    if (allDeps.jest) techs.push('Jest');
    if (allDeps.vitest) techs.push('Vitest');
    if (techs.length === 0) techs.push('Node.js');
  } catch { /* ignore */ }
  return techs;
}

async function detectEntryPoints(projectRoot: string): Promise<string[]> {
  const entryPoints: string[] = [];
  const candidates = [
    'src/index.ts',
    'src/index.js',
    'src/main.ts',
    'src/main.js',
    'src/app.ts',
    'src/app.js',
    'index.ts',
    'index.js',
    'main.ts',
    'main.js',
    'main.go',
    'cmd/main.go',
    'src/main.py',
    'app.py',
    'manage.py',
  ];

  for (const candidate of candidates) {
    try {
      await readFile(join(projectRoot, candidate), 'utf-8');
      entryPoints.push(candidate);
    } catch { /* ignore */ }
  }

  return entryPoints;
}
