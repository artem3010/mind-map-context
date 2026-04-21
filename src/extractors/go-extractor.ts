import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo, DependencyInfo } from '../mindmap/node.js';

export class GoExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const lines = content.split('\n');
    const lineCount = lines.length;
    const exports = extractExports(content);
    const dependencies = extractImports(content);
    const structure = extractStructure(content);
    const summary = buildSummary(filePath, exports, content);
    const tags = detectTags(filePath, content);

    return {
      summary,
      tags,
      exports,
      dependencies,
      structure,
      lineCount,
      fileKind: 'go',
    };
  }
}

function extractExports(content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  // Exported functions: func FuncName(...)
  for (const m of content.matchAll(/^func\s+(\([^)]+\)\s+)?([A-Z]\w*)\s*\(([^)]*)\)(?:\s*(?:\(([^)]*)\)|(\S+)))?/gm)) {
    const receiver = m[1]?.trim();
    const name = m[2];
    if (seen.has(name)) continue;
    seen.add(name);

    const params = summarizeGoParams(m[3]);
    const returns = m[4] || m[5] || '';
    const desc = receiver
      ? `method on ${receiver}${returns ? ' → ' + returns : ''}`
      : params ? `(${params})${returns ? ' → ' + returns : ''}` : returns ? `→ ${returns}` : undefined;

    symbols.push({
      name,
      kind: receiver ? 'function' : 'function',
      description: desc,
    });
  }

  // Exported types: type TypeName struct/interface/...
  for (const m of content.matchAll(/^type\s+([A-Z]\w*)\s+(\w+)/gm)) {
    const name = m[1];
    const kind = m[2];
    if (seen.has(name)) continue;
    seen.add(name);
    symbols.push({
      name,
      kind: kind === 'interface' ? 'interface' : 'type',
      description: kind,
    });
  }

  // Exported constants: const Name = ...
  for (const m of content.matchAll(/^(?:const|var)\s+([A-Z]\w*)\s/gm)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    symbols.push({ name, kind: 'constant' });
  }

  // Exported const blocks
  for (const block of content.matchAll(/^const\s*\(\s*\n([\s\S]*?)\n\)/gm)) {
    for (const m of block[1].matchAll(/^\s+([A-Z]\w*)/gm)) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      symbols.push({ name, kind: 'constant' });
    }
  }

  return symbols;
}

function extractImports(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];

  // Single import: import "path"
  for (const m of content.matchAll(/^import\s+"([^"]+)"/gm)) {
    deps.push({ target: m[1], symbols: [] });
  }

  // Import block
  for (const block of content.matchAll(/^import\s*\(\s*\n([\s\S]*?)\n\)/gm)) {
    for (const m of block[1].matchAll(/(?:(\w+)\s+)?"([^"]+)"/g)) {
      const alias = m[1] || '';
      const path = m[2];
      deps.push({ target: path, symbols: alias ? [alias] : [] });
    }
  }

  return deps;
}

function extractStructure(content: string): string[] {
  const lines: string[] = [];

  // Function signatures
  for (const m of content.matchAll(/^(func\s+(?:\([^)]+\)\s+)?[A-Z]\w*\s*\([^)]*\)(?:\s*(?:\([^)]*\)|\S+))?)/gm)) {
    lines.push(m[1]);
  }

  // Type declarations
  for (const m of content.matchAll(/^(type\s+[A-Z]\w*\s+\w+)/gm)) {
    lines.push(m[1]);
  }

  return lines;
}

function buildSummary(filePath: string, exports: SymbolInfo[], content: string): string {
  // Package doc comment (first comment before package declaration)
  const docMatch = content.match(/^\/\/\s*(.+)\npackage\s/m);
  if (docMatch) return docMatch[1].trim();

  // Package-level comment block
  const blockDocMatch = content.match(/^\/\*\s*\n([\s\S]*?)\*\/\s*\npackage/m);
  if (blockDocMatch) {
    const firstLine = blockDocMatch[1].split('\n')[0].trim().replace(/^\*\s*/, '');
    if (firstLine) return firstLine;
  }

  if (exports.length > 0) {
    const names = exports.slice(0, 4).map(e => e.name);
    const suffix = exports.length > 4 ? ` +${exports.length - 4} more` : '';
    return `Exports: ${names.join(', ')}${suffix}`;
  }

  // Package name
  const pkgMatch = content.match(/^package\s+(\w+)/m);
  if (pkgMatch) return `package ${pkgMatch[1]}`;

  return `${content.split('\n').length} lines`;
}

function summarizeGoParams(params: string): string {
  if (!params.trim()) return '';
  return params
    .split(',')
    .map(p => {
      const parts = p.trim().split(/\s+/);
      return parts[0] || '';
    })
    .filter(Boolean)
    .join(', ');
}

function detectTags(filePath: string, content: string): string[] {
  const tags: string[] = [];
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] || '';

  // Directory-based
  const dirTags = new Set(['cmd', 'internal', 'pkg', 'api', 'handler', 'handlers', 'middleware', 'model', 'models', 'service', 'services', 'repository', 'config', 'utils', 'test', 'tests', 'migrations']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  // Filename patterns
  if (filename.endsWith('_test.go')) tags.push('test');
  if (filename === 'main.go') tags.push('entry');

  // Import-based
  const importBlock = content.match(/import\s*\(\s*\n([\s\S]*?)\n\)/)?.[1] || '';
  if (importBlock.includes('"net/http"') || importBlock.includes('gin-gonic') || importBlock.includes('echo')) tags.push('http');
  if (importBlock.includes('database/sql') || importBlock.includes('gorm') || importBlock.includes('sqlx')) tags.push('database');
  if (importBlock.includes('grpc')) tags.push('grpc');
  if (importBlock.includes('testing')) tags.push('test');

  return [...new Set(tags)];
}
