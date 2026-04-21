import { parse as parseYaml } from 'yaml';
import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo } from '../mindmap/node.js';

export class JsonExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const filename = filePath.split('/').pop() || '';
    const lineCount = content.split('\n').length;

    let parsed: unknown;
    try {
      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        parsed = parseYaml(content);
      } else {
        parsed = JSON.parse(content);
      }
    } catch {
      return {
        summary: `Invalid ${filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'YAML' : 'JSON'}`,
        tags: detectTags(filePath),
        exports: [],
        dependencies: [],
        structure: [],
        sections: [],
        lineCount,
        fileKind: filePath.endsWith('.yaml') || filePath.endsWith('.yml') ? 'yaml' : 'json',
      };
    }

    // Special handling for known config files
    const handler = SPECIAL_HANDLERS[filename.toLowerCase()];
    if (handler) {
      return handler(filePath, parsed, lineCount);
    }

    // Generic JSON/YAML: extract top-level keys
    return extractGenericJson(filePath, parsed, lineCount);
  }
}

type Handler = (filePath: string, data: unknown, lineCount: number) => ExtractResult;

const SPECIAL_HANDLERS: Record<string, Handler> = {
  'package.json': extractPackageJson,
  'tsconfig.json': extractTsConfig,
  'docker-compose.yml': extractDockerCompose,
  'docker-compose.yaml': extractDockerCompose,
};

function extractPackageJson(filePath: string, data: unknown, lineCount: number): ExtractResult {
  const pkg = data as Record<string, unknown>;
  const exports: SymbolInfo[] = [];

  // Scripts
  if (pkg.scripts && typeof pkg.scripts === 'object') {
    const scripts = pkg.scripts as Record<string, string>;
    for (const [name, cmd] of Object.entries(scripts)) {
      exports.push({ name, kind: 'export', description: cmd });
    }
  }

  const deps = Object.keys((pkg.dependencies as Record<string, string>) || {});
  const devDeps = Object.keys((pkg.devDependencies as Record<string, string>) || {});

  const structure: string[] = [];
  if (deps.length > 0) structure.push(`dependencies: ${deps.join(', ')}`);
  if (devDeps.length > 0) structure.push(`devDependencies: ${devDeps.join(', ')}`);

  const name = (pkg.name as string) || 'package.json';
  const version = pkg.version ? ` v${pkg.version}` : '';
  const description = (pkg.description as string) || '';

  return {
    summary: description || `${name}${version}`,
    tags: ['config', 'npm'],
    exports,
    dependencies: [],
    structure,
    sections: [],
    lineCount,
    fileKind: 'json',
  };
}

function extractTsConfig(filePath: string, data: unknown, lineCount: number): ExtractResult {
  const config = data as Record<string, unknown>;
  const exports: SymbolInfo[] = [];

  const compilerOptions = config.compilerOptions as Record<string, unknown> | undefined;
  if (compilerOptions) {
    const important = ['target', 'module', 'moduleResolution', 'strict', 'outDir', 'rootDir', 'jsx', 'baseUrl'];
    for (const key of important) {
      if (compilerOptions[key] !== undefined) {
        exports.push({
          name: key,
          kind: 'constant',
          description: String(compilerOptions[key]),
        });
      }
    }
  }

  const include = config.include as string[] | undefined;
  const exclude = config.exclude as string[] | undefined;
  const structure: string[] = [];
  if (include) structure.push(`include: ${include.join(', ')}`);
  if (exclude) structure.push(`exclude: ${exclude.join(', ')}`);

  return {
    summary: 'TypeScript configuration',
    tags: ['config', 'typescript'],
    exports,
    dependencies: [],
    structure,
    sections: [],
    lineCount,
    fileKind: 'json',
  };
}

function extractDockerCompose(filePath: string, data: unknown, lineCount: number): ExtractResult {
  const compose = data as Record<string, unknown>;
  const exports: SymbolInfo[] = [];

  const services = compose.services as Record<string, unknown> | undefined;
  if (services) {
    for (const [name, config] of Object.entries(services)) {
      const svc = config as Record<string, unknown>;
      const image = svc.image as string | undefined;
      const build = svc.build ? 'build' : undefined;
      exports.push({
        name,
        kind: 'export',
        description: image || build || 'service',
      });
    }
  }

  return {
    summary: `Docker Compose — ${exports.length} service${exports.length !== 1 ? 's' : ''}`,
    tags: ['config', 'docker'],
    exports,
    dependencies: [],
    structure: [],
    sections: [],
    lineCount,
    fileKind: 'yaml',
  };
}

function extractGenericJson(filePath: string, data: unknown, lineCount: number): ExtractResult {
  const exports: SymbolInfo[] = [];
  const isYaml = filePath.endsWith('.yaml') || filePath.endsWith('.yml');

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const kind = Array.isArray(value) ? 'type' as const
        : typeof value === 'object' && value !== null ? 'interface' as const
        : 'constant' as const;

      let desc: string | undefined;
      if (typeof value === 'string') desc = value.length > 60 ? value.slice(0, 57) + '...' : value;
      else if (typeof value === 'number' || typeof value === 'boolean') desc = String(value);
      else if (Array.isArray(value)) desc = `[${value.length} items]`;

      exports.push({ name: key, kind, description: desc });
    }
  }

  return {
    summary: `${isYaml ? 'YAML' : 'JSON'} config — ${exports.length} keys`,
    tags: detectTags(filePath),
    exports,
    dependencies: [],
    structure: [],
    sections: [],
    lineCount,
    fileKind: isYaml ? 'yaml' : 'json',
  };
}

function detectTags(filePath: string): string[] {
  const tags: string[] = ['config'];
  const filename = (filePath.split('/').pop() || '').toLowerCase();

  if (filename.includes('eslint') || filename.includes('prettier') || filename.includes('lint')) tags.push('linting');
  if (filename.includes('docker')) tags.push('docker');
  if (filename.includes('ci') || filename.includes('github')) tags.push('ci');
  if (filename.includes('babel') || filename.includes('webpack') || filename.includes('vite') || filename.includes('rollup')) tags.push('build');

  return tags;
}
