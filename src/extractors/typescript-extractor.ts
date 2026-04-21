import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo, DependencyInfo } from '../mindmap/node.js';

/**
 * Regex-based TypeScript/JavaScript extractor.
 * Extracts exports, imports, types, interfaces, classes, functions.
 */
export class TypeScriptExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const lines = content.split('\n');
    const lineCount = lines.length;
    const exports = extractExports(content);
    const dependencies = extractImports(content, filePath);
    const structure = extractStructure(content);
    const summary = buildSummary(filePath, exports, content);
    const tags = detectTags(filePath, content);
    const ext = filePath.endsWith('.tsx') || filePath.endsWith('.jsx') ? 'tsx' : 'typescript';

    return {
      summary,
      tags,
      exports,
      dependencies,
      structure,
      sections: [],
      lineCount,
      fileKind: ext,
    };
  }
}

function extractExports(content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  // export function name(...)
  for (const m of content.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(([^)]*)\)(?:\s*:\s*([^\s{]+))?/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const params = summarizeParams(m[2]);
    const ret = m[3] ? `: ${m[3]}` : '';
    symbols.push({
      name: m[1],
      kind: 'function',
      description: params ? `(${params})${ret}` : ret || undefined,
    });
  }

  // export const/let/var name
  for (const m of content.matchAll(/^export\s+(?:const|let|var)\s+(\w+)(?:\s*:\s*([^\s=]+))?/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    symbols.push({
      name: m[1],
      kind: 'constant',
      description: m[2] || undefined,
    });
  }

  // export interface name
  for (const m of content.matchAll(/^export\s+interface\s+(\w+)(?:\s*<[^>]*>)?(?:\s+extends\s+([^\s{]+))?/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    symbols.push({
      name: m[1],
      kind: 'interface',
      description: m[2] ? `extends ${m[2]}` : undefined,
    });
  }

  // export type name
  for (const m of content.matchAll(/^export\s+type\s+(\w+)(?:\s*<[^>]*>)?\s*=/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    symbols.push({ name: m[1], kind: 'type' });
  }

  // export class name
  for (const m of content.matchAll(/^export\s+(?:abstract\s+)?class\s+(\w+)(?:\s*<[^>]*>)?(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^\s{]+))?/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const parts: string[] = [];
    if (m[2]) parts.push(`extends ${m[2]}`);
    if (m[3]) parts.push(`implements ${m[3]}`);
    symbols.push({
      name: m[1],
      kind: 'class',
      description: parts.length > 0 ? parts.join(', ') : undefined,
    });
  }

  // export enum name
  for (const m of content.matchAll(/^export\s+(?:const\s+)?enum\s+(\w+)/gm)) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    symbols.push({ name: m[1], kind: 'type', description: 'enum' });
  }

  // export default
  for (const m of content.matchAll(/^export\s+default\s+(?:function\s+)?(\w+)?/gm)) {
    const name = m[1] || 'default';
    if (seen.has(name)) continue;
    seen.add(name);
    symbols.push({ name, kind: 'export', description: 'default export' });
  }

  return symbols;
}

function extractImports(content: string, filePath: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const seen = new Set<string>();

  // import { a, b } from 'path'
  // import name from 'path'
  // import * as name from 'path'
  for (const m of content.matchAll(/^import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+)|\*\s+as\s+(\w+))\s+from\s+['"]([^'"]+)['"]/gm)) {
    const source = m[4];
    if (seen.has(source)) continue;
    seen.add(source);

    const symbols: string[] = [];
    if (m[1]) {
      // Named imports: { a, b, c as d }
      for (const sym of m[1].split(',')) {
        const name = sym.trim().split(/\s+as\s+/)[0].trim();
        if (name) symbols.push(name);
      }
    } else if (m[2]) {
      symbols.push(m[2]);
    } else if (m[3]) {
      symbols.push(`* as ${m[3]}`);
    }

    deps.push({ target: source, symbols });
  }

  // import 'path' (side-effect imports)
  for (const m of content.matchAll(/^import\s+['"]([^'"]+)['"]/gm)) {
    const source = m[1];
    if (!seen.has(source)) {
      seen.add(source);
      deps.push({ target: source, symbols: [] });
    }
  }

  // Dynamic imports: import('path')
  for (const m of content.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    const source = m[1];
    if (!seen.has(source)) {
      seen.add(source);
      deps.push({ target: source, symbols: [] });
    }
  }

  // require('path')
  for (const m of content.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/gm)) {
    const source = m[1];
    if (!seen.has(source)) {
      seen.add(source);
      deps.push({ target: source, symbols: [] });
    }
  }

  return deps;
}

function extractStructure(content: string): string[] {
  const lines: string[] = [];

  // Export function signatures
  for (const m of content.matchAll(/^(export\s+(?:async\s+)?function\s+\w+(?:<[^>]*>)?\s*\([^)]*\)(?:\s*:\s*[^\s{]+)?)/gm)) {
    lines.push(m[1]);
  }

  // Export interface/type one-liners
  for (const m of content.matchAll(/^(export\s+(?:interface|type)\s+\w+(?:<[^>]*>)?(?:\s+extends\s+[^\s{]+)?)/gm)) {
    lines.push(m[1]);
  }

  // Export class signatures
  for (const m of content.matchAll(/^(export\s+(?:abstract\s+)?class\s+\w+(?:<[^>]*>)?(?:\s+extends\s+\w+)?(?:\s+implements\s+[^\s{]+)?)/gm)) {
    lines.push(m[1]);
  }

  return lines;
}

function buildSummary(filePath: string, exports: SymbolInfo[], content: string): string {
  // Try to get summary from first JSDoc comment
  const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
  if (jsdocMatch) {
    return jsdocMatch[1].trim().replace(/\s*\*\/$/, '');
  }

  // Try first line comment
  const commentMatch = content.match(/^\/\/\s*(.+)/m);
  if (commentMatch && !commentMatch[1].startsWith('/')) {
    return commentMatch[1].trim();
  }

  // Build from exports
  if (exports.length > 0) {
    const names = exports.slice(0, 4).map(e => `${e.name}`);
    const suffix = exports.length > 4 ? ` +${exports.length - 4} more` : '';
    return `Exports: ${names.join(', ')}${suffix}`;
  }

  return `${content.split('\n').length} lines`;
}

function summarizeParams(params: string): string {
  return params
    .split(',')
    .map(p => p.trim().split(':')[0].trim().split('=')[0].trim())
    .filter(Boolean)
    .join(', ');
}

function detectTags(filePath: string, content: string): string[] {
  const tags: string[] = [];
  const parts = filePath.split('/');

  // Directory-based tags
  const dirTags = new Set(['test', 'tests', 'spec', 'docs', 'config', 'utils', 'helpers', 'lib', 'api', 'auth', 'middleware', 'models', 'services', 'components', 'hooks', 'pages', 'routes', 'scripts', 'migrations']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  // Filename pattern tags
  const filename = parts[parts.length - 1] || '';
  if (filename.includes('.test.') || filename.includes('.spec.')) tags.push('test');
  if (filename.includes('.config.')) tags.push('config');
  if (filename.startsWith('index.')) tags.push('entry');

  // Import-based tags (more precise than content.includes)
  const importLines = content.split('\n').filter(l => /^import\s/.test(l)).join(' ');
  if (/['"]express['"]/.test(importLines) || /['"]fastify['"]/.test(importLines) || /['"]koa['"]/.test(importLines)) tags.push('http');
  if (/['"]react['"]/.test(importLines) || /['"]react-dom['"]/.test(importLines)) tags.push('react');
  if (/['"]prisma['"]|['"]@prisma\//.test(importLines) || /['"]sequelize['"]/.test(importLines) || /['"]typeorm['"]/.test(importLines) || /['"]mongoose['"]/.test(importLines)) tags.push('database');
  if (/['"]vitest['"]/.test(importLines) || /['"]jest['"]/.test(importLines) || /['"]\@testing-library/.test(importLines)) tags.push('test');

  return [...new Set(tags)];
}
