import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo, DependencyInfo } from '../mindmap/node.js';

export class PythonExtractor implements Extractor {
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
      fileKind: 'python',
    };
  }
}

function extractExports(content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  // __all__ defines explicit exports
  const allMatch = content.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
  const explicitExports = allMatch
    ? new Set(allMatch[1].match(/['"](\w+)['"]/g)?.map(s => s.replace(/['"]/g, '')) || [])
    : null;

  // Top-level functions: def func_name(...)
  for (const m of content.matchAll(/^def\s+(\w+)\s*\(([^)]*)\)(?:\s*->\s*(\S+))?/gm)) {
    const name = m[1];
    if (name.startsWith('_') && !name.startsWith('__')) continue; // Skip private
    if (explicitExports && !explicitExports.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const params = summarizeParams(m[2]);
    const ret = m[3] ? ` → ${m[3]}` : '';
    symbols.push({
      name,
      kind: 'function',
      description: params ? `(${params})${ret}` : ret || undefined,
    });
  }

  // Top-level classes: class ClassName(...)
  for (const m of content.matchAll(/^class\s+(\w+)(?:\(([^)]*)\))?/gm)) {
    const name = m[1];
    if (name.startsWith('_')) continue;
    if (explicitExports && !explicitExports.has(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);

    const bases = m[2]?.trim();
    symbols.push({
      name,
      kind: 'class',
      description: bases ? `(${bases})` : undefined,
    });
  }

  // Top-level constants: UPPER_CASE = ...
  for (const m of content.matchAll(/^([A-Z][A-Z0-9_]+)\s*(?::\s*\w+\s*)?=/gm)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    symbols.push({ name, kind: 'constant' });
  }

  // Type aliases / TypeVar
  for (const m of content.matchAll(/^(\w+)\s*=\s*(?:TypeVar|NewType|Union|Optional|Literal)\b/gm)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    symbols.push({ name, kind: 'type' });
  }

  return symbols;
}

function extractImports(content: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  const seen = new Set<string>();

  // import module
  for (const m of content.matchAll(/^import\s+([\w.]+)(?:\s+as\s+\w+)?/gm)) {
    const target = m[1];
    if (!seen.has(target)) {
      seen.add(target);
      deps.push({ target, symbols: [] });
    }
  }

  // from module import name1, name2
  for (const m of content.matchAll(/^from\s+([\w.]+)\s+import\s+(.+)/gm)) {
    const target = m[1];
    if (!seen.has(target)) {
      seen.add(target);
      const symbols = m[2]
        .split(',')
        .map(s => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(s => s && s !== '*');
      deps.push({ target, symbols });
    }
  }

  return deps;
}

function extractStructure(content: string): string[] {
  const lines: string[] = [];

  // Function signatures
  for (const m of content.matchAll(/^(def\s+\w+\s*\([^)]*\)(?:\s*->\s*\S+)?)/gm)) {
    if (!m[1].includes('def _') || m[1].includes('def __')) {
      lines.push(m[1]);
    }
  }

  // Class declarations
  for (const m of content.matchAll(/^(class\s+\w+(?:\([^)]*\))?)/gm)) {
    if (!m[1].includes('class _')) {
      lines.push(m[1]);
    }
  }

  return lines;
}

function buildSummary(filePath: string, exports: SymbolInfo[], content: string): string {
  // Module docstring (triple-quoted at start)
  const docMatch = content.match(/^(?:#!.*\n)?(?:#.*\n)*\s*(?:"""([\s\S]*?)"""|'''([\s\S]*?)''')/);
  if (docMatch) {
    const doc = (docMatch[1] || docMatch[2] || '').trim();
    const firstLine = doc.split('\n')[0].trim();
    if (firstLine) return firstLine.length > 120 ? firstLine.slice(0, 117) + '...' : firstLine;
  }

  // First comment line
  const commentMatch = content.match(/^#\s*(?!!)(.+)/m);
  if (commentMatch) {
    return commentMatch[1].trim();
  }

  if (exports.length > 0) {
    const names = exports.slice(0, 4).map(e => e.name);
    const suffix = exports.length > 4 ? ` +${exports.length - 4} more` : '';
    return `Exports: ${names.join(', ')}${suffix}`;
  }

  return `${content.split('\n').length} lines`;
}

function summarizeParams(params: string): string {
  return params
    .split(',')
    .map(p => p.trim().split(':')[0].split('=')[0].trim())
    .filter(p => p && p !== 'self' && p !== 'cls')
    .join(', ');
}

function detectTags(filePath: string, content: string): string[] {
  const tags: string[] = [];
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1] || '';

  // Directory-based
  const dirTags = new Set(['tests', 'test', 'api', 'models', 'views', 'serializers', 'commands', 'management', 'utils', 'helpers', 'services', 'middleware', 'migrations', 'schemas', 'routers']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  // Filename patterns
  if (filename.startsWith('test_') || filename.endsWith('_test.py')) tags.push('test');
  if (filename === '__init__.py') tags.push('entry');
  if (filename === 'conftest.py') tags.push('test', 'config');
  if (filename === 'setup.py' || filename === 'pyproject.toml') tags.push('config');

  // Import-based
  const imports = content.split('\n').filter(l => /^(?:import|from)\s/.test(l)).join(' ');
  if (/\bflask\b/.test(imports) || /\bdjango\b/.test(imports) || /\bfastapi\b/.test(imports)) tags.push('http');
  if (/\bsqlalchemy\b/.test(imports) || /\bdjango\.db\b/.test(imports)) tags.push('database');
  if (/\bpytest\b/.test(imports) || /\bunittest\b/.test(imports)) tags.push('test');
  if (/\bcelery\b/.test(imports) || /\brq\b/.test(imports)) tags.push('async');
  if (/\bpandas\b/.test(imports) || /\bnumpy\b/.test(imports)) tags.push('data');

  return [...new Set(tags)];
}
