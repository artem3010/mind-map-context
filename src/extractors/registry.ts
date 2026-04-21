import type { Extractor } from './extractor.js';
import { GenericExtractor } from './generic-extractor.js';
import { TypeScriptExtractor } from './typescript-extractor.js';
import { MarkdownExtractor } from './markdown-extractor.js';
import { JsonExtractor } from './json-extractor.js';
import { GoExtractor } from './go-extractor.js';
import { PythonExtractor } from './python-extractor.js';

const genericExtractor = new GenericExtractor();
const tsExtractor = new TypeScriptExtractor();
const mdExtractor = new MarkdownExtractor();
const jsonExtractor = new JsonExtractor();
const goExtractor = new GoExtractor();
const pyExtractor = new PythonExtractor();

const extensionMap: Record<string, Extractor> = {
  '.ts': tsExtractor,
  '.tsx': tsExtractor,
  '.js': tsExtractor,
  '.jsx': tsExtractor,
  '.mjs': tsExtractor,
  '.cjs': tsExtractor,
  '.md': mdExtractor,
  '.mdx': mdExtractor,
  '.json': jsonExtractor,
  '.yaml': jsonExtractor,
  '.yml': jsonExtractor,
  '.go': goExtractor,
  '.py': pyExtractor,
  '.pyi': pyExtractor,
};

export function getExtractor(filePath: string): Extractor {
  const ext = getExtension(filePath);
  return extensionMap[ext] || genericExtractor;
}

function getExtension(filePath: string): string {
  const base = filePath.split('/').pop() || '';
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}
