import type { Extractor, ExtractResult } from './extractor.js';

const MAX_SUMMARY_LINES = 5;

export class GenericExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Take first meaningful non-empty lines as summary (skip imports, shebangs, etc.)
    const summaryLines: string[] = [];
    for (const line of lines) {
      if (summaryLines.length >= MAX_SUMMARY_LINES) break;
      const trimmed = line.trim();
      if (isBoilerplate(trimmed)) continue;
      if (trimmed) {
        summaryLines.push(trimmed);
      } else if (summaryLines.length > 0) {
        break; // Stop at first blank line after content
      }
    }

    const summary = summaryLines[0] || `${lineCount} lines`;
    const ext = getExtension(filePath);
    const fileKind = EXT_TO_KIND[ext] || 'text';
    const tags = detectTags(filePath, content);

    // For generic files, capture first meaningful block as a section
    const contentBlock = summaryLines.join(' ').trim();
    const sections = contentBlock
      ? [{ heading: '(content)', depth: 0, content: contentBlock.slice(0, 300) }]
      : [];

    return {
      summary,
      tags,
      exports: [],
      dependencies: [],
      structure: [],
      sections,
      lineCount,
      fileKind,
    };
  }
}

const EXT_TO_KIND: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c-header',
  '.hpp': 'cpp-header',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.md': 'markdown',
  '.mdx': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.dockerfile': 'docker',
  '.proto': 'protobuf',
  '.graphql': 'graphql',
  '.gql': 'graphql',
};

const BOILERPLATE_PATTERNS = [
  /^import\s/,
  /^from\s/,
  /^require\s*\(/,
  /^#!\//,              // shebang
  /^\/\*\*?$/,          // opening block comment
  /^\*\s/,              // block comment continuation
  /^\*\/$/,             // closing block comment
  /^\/\//,              // line comment
  /^#\s*(pragma|include|define|ifdef|ifndef)/,
  /^package\s/,
  /^use\s/,
  /^using\s/,
  /^'use strict'/,
  /^"use strict"/,
];

function isBoilerplate(line: string): boolean {
  if (!line) return true;
  return BOILERPLATE_PATTERNS.some(p => p.test(line));
}

function getExtension(filePath: string): string {
  const base = filePath.split('/').pop() || '';
  // Handle special filenames
  if (base === 'Dockerfile') return '.dockerfile';
  if (base === 'Makefile') return '.makefile';
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}

function detectTags(filePath: string, content: string): string[] {
  const tags: string[] = [];
  const parts = filePath.split('/');

  // Tag from directory names
  const dirTags = new Set(['test', 'tests', 'spec', 'docs', 'config', 'utils', 'helpers', 'lib', 'api', 'auth', 'middleware', 'models', 'services', 'components', 'hooks', 'pages', 'routes', 'scripts', 'migrations']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  // Tag from filename patterns
  const filename = parts[parts.length - 1] || '';
  if (filename.includes('.test.') || filename.includes('.spec.')) tags.push('test');
  if (filename.includes('.config.') || filename === 'config.ts' || filename === 'config.js') tags.push('config');
  if (filename.startsWith('index.')) tags.push('entry');

  return [...new Set(tags)];
}
