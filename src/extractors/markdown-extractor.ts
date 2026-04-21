import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { toString } from 'mdast-util-to-string';
import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo, DependencyInfo } from '../mindmap/node.js';
import type { Content, Heading, Link, Root } from 'mdast';

export class MarkdownExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const tree = fromMarkdown(content, {
      extensions: [frontmatter(['yaml'])],
      mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
    });

    const lineCount = content.split('\n').length;
    const headings = extractHeadings(tree);
    const links = extractLinks(content);
    const wikiLinks = extractWikiLinks(content);
    const fmData = extractFrontmatter(tree);
    const summary = buildSummary(tree, fmData, headings);
    const tags = detectTags(filePath, fmData, headings);

    // Headings become "exports" (structural elements)
    const exports: SymbolInfo[] = headings.map(h => ({
      name: h.text,
      kind: 'export' as const,
      description: `h${h.depth}`,
    }));

    // Links become dependencies
    const dependencies: DependencyInfo[] = [];
    for (const link of [...links, ...wikiLinks]) {
      dependencies.push({
        target: link.target,
        symbols: link.text ? [link.text] : [],
      });
    }

    // Structure: heading outline
    const structure = headings.map(h => {
      const indent = '  '.repeat(h.depth - 1);
      return `${indent}${h.text}`;
    });

    return {
      summary,
      tags,
      exports,
      dependencies,
      structure,
      lineCount,
      fileKind: 'markdown',
    };
  }
}

interface HeadingInfo {
  depth: number;
  text: string;
}

interface LinkInfo {
  target: string;
  text: string;
}

function extractHeadings(tree: Root): HeadingInfo[] {
  const headings: HeadingInfo[] = [];

  function walk(node: Root | Content) {
    if (node.type === 'heading') {
      const heading = node as Heading;
      headings.push({
        depth: heading.depth,
        text: toString(heading),
      });
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        walk(child as Content);
      }
    }
  }

  walk(tree);
  return headings;
}

function extractLinks(content: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();

  // Standard markdown links: [text](url)
  for (const m of content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const target = m[2];
    // Only include relative links (not http/https)
    if (!target.startsWith('http://') && !target.startsWith('https://') && !target.startsWith('#')) {
      if (!seen.has(target)) {
        seen.add(target);
        links.push({ target, text: m[1] });
      }
    }
  }

  return links;
}

function extractWikiLinks(content: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();

  // Wiki links: [[target]] or [[target|display]]
  for (const m of content.matchAll(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g)) {
    const target = m[1].trim();
    const text = m[2]?.trim() || target;
    if (!seen.has(target)) {
      seen.add(target);
      links.push({ target, text });
    }
  }

  return links;
}

function extractFrontmatter(tree: Root): Record<string, string> {
  const fm: Record<string, string> = {};
  for (const node of tree.children) {
    if (node.type === 'yaml') {
      const yamlContent = (node as { value: string }).value;
      for (const line of yamlContent.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        fm[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
      }
      break;
    }
  }
  return fm;
}

function buildSummary(
  tree: Root,
  fm: Record<string, string>,
  headings: HeadingInfo[],
): string {
  // Use frontmatter description/title
  if (fm.description) return fm.description;
  if (fm.title) return fm.title;
  if (fm.summary) return fm.summary;

  // Use first h1
  const h1 = headings.find(h => h.depth === 1);
  if (h1) return h1.text;

  // Use first paragraph
  for (const node of tree.children) {
    if (node.type === 'paragraph') {
      const text = toString(node);
      if (text.length > 120) return text.slice(0, 117) + '...';
      return text;
    }
  }

  return '';
}

function detectTags(
  filePath: string,
  fm: Record<string, string>,
  headings: HeadingInfo[],
): string[] {
  const tags: string[] = [];
  const parts = filePath.split('/');

  // Directory-based tags
  const dirTags = new Set(['docs', 'doc', 'guide', 'guides', 'wiki', 'blog', 'posts', 'articles']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  // Frontmatter tags
  if (fm.tags) {
    const fmTags = fm.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
    tags.push(...fmTags);
  }
  if (fm.category) tags.push(fm.category);

  // Filename patterns
  const filename = (parts[parts.length - 1] || '').toLowerCase();
  if (filename === 'readme.md') tags.push('readme');
  if (filename === 'changelog.md') tags.push('changelog');
  if (filename.includes('api')) tags.push('api');
  if (filename.includes('setup') || filename.includes('install')) tags.push('setup');

  return [...new Set(tags)];
}
