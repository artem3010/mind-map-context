import { fromMarkdown } from 'mdast-util-from-markdown';
import { frontmatter } from 'micromark-extension-frontmatter';
import { frontmatterFromMarkdown } from 'mdast-util-frontmatter';
import { toString } from 'mdast-util-to-string';
import type { Extractor, ExtractResult } from './extractor.js';
import type { SymbolInfo, DependencyInfo, SectionInfo } from '../mindmap/node.js';
import type { Content, Heading, Root } from 'mdast';

const MAX_SECTION_CHARS = 300;

export class MarkdownExtractor implements Extractor {
  extract(filePath: string, content: string): ExtractResult {
    const tree = fromMarkdown(content, {
      extensions: [frontmatter(['yaml'])],
      mdastExtensions: [frontmatterFromMarkdown(['yaml'])],
    });

    const lineCount = content.split('\n').length;
    const fmData = extractFrontmatter(tree);
    const sections = extractSections(tree);
    const headings = sections.map(s => ({ depth: s.depth, text: s.heading }));
    const links = extractLinks(content);
    const wikiLinks = extractWikiLinks(content);
    const summary = buildSummary(tree, fmData, headings, sections);
    const tags = detectTags(filePath, fmData, headings);

    // Headings become "exports"
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
      sections,
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

/**
 * Extract sections with content summaries.
 * Each section = heading + first meaningful paragraph(s) under it.
 * This is what makes mind maps useful for content — we capture MEANING.
 */
function extractSections(tree: Root): SectionInfo[] {
  const sections: SectionInfo[] = [];

  // Collect text between headings
  let currentHeading: string | null = null;
  let currentDepth = 0;
  let currentContent: string[] = [];
  let preHeadingContent: string[] = [];

  for (const node of tree.children) {
    if (node.type === 'yaml') continue;

    if (node.type === 'heading') {
      // Save previous section
      if (currentHeading !== null) {
        const content = summarizeContent(currentContent);
        if (content) {
          sections.push({ heading: currentHeading, depth: currentDepth, content });
        }
      } else if (preHeadingContent.length > 0) {
        // Content before first heading — treat as intro
        const content = summarizeContent(preHeadingContent);
        if (content) {
          sections.push({ heading: '(intro)', depth: 0, content });
        }
      }

      currentHeading = toString(node as Heading);
      currentDepth = (node as Heading).depth;
      currentContent = [];
    } else {
      const text = toString(node).trim();
      if (text) {
        if (currentHeading !== null) {
          currentContent.push(text);
        } else {
          preHeadingContent.push(text);
        }
      }
    }
  }

  // Last section
  if (currentHeading !== null) {
    const content = summarizeContent(currentContent);
    if (content) {
      sections.push({ heading: currentHeading, depth: currentDepth, content });
    }
  } else if (preHeadingContent.length > 0 && sections.length === 0) {
    // File with no headings — treat entire content as one section
    const content = summarizeContent(preHeadingContent);
    if (content) {
      sections.push({ heading: '(content)', depth: 0, content });
    }
  }

  return sections;
}

/**
 * Summarize content paragraphs into a compact string.
 * Takes first ~300 chars of meaningful text.
 */
function summarizeContent(paragraphs: string[]): string {
  if (paragraphs.length === 0) return '';

  let result = '';
  for (const para of paragraphs) {
    if (result.length >= MAX_SECTION_CHARS) break;

    // Skip very short lines (likely list markers left over)
    if (para.length < 3) continue;

    if (result) result += ' ';
    result += para;
  }

  if (result.length > MAX_SECTION_CHARS) {
    // Cut at sentence boundary if possible
    const truncated = result.slice(0, MAX_SECTION_CHARS);
    const lastSentence = truncated.search(/[.!?。]\s+[^\s]/);
    if (lastSentence > MAX_SECTION_CHARS * 0.5) {
      return truncated.slice(0, lastSentence + 1).trim();
    }
    return truncated.trim() + '...';
  }

  return result.trim();
}

function extractLinks(content: string): LinkInfo[] {
  const links: LinkInfo[] = [];
  const seen = new Set<string>();

  for (const m of content.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const target = m[2];
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
  sections: SectionInfo[],
): string {
  if (fm.description) return fm.description;
  if (fm.title) return fm.title;
  if (fm.summary) return fm.summary;

  // Use first h1
  const h1 = headings.find(h => h.depth === 1);
  if (h1) return h1.text;

  // Use intro section content if available
  const intro = sections.find(s => s.heading === '(intro)' || s.heading === '(content)');
  if (intro && intro.content) {
    const firstSentence = intro.content.match(/^[^.!?。]*[.!?。]/);
    if (firstSentence) return firstSentence[0].trim();
    return intro.content.length > 120 ? intro.content.slice(0, 117) + '...' : intro.content;
  }

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

  const dirTags = new Set(['docs', 'doc', 'guide', 'guides', 'wiki', 'blog', 'posts', 'articles']);
  for (const part of parts) {
    if (dirTags.has(part.toLowerCase())) {
      tags.push(part.toLowerCase());
    }
  }

  if (fm.tags) {
    const fmTags = fm.tags.replace(/[\[\]]/g, '').split(',').map(t => t.trim()).filter(Boolean);
    tags.push(...fmTags);
  }
  if (fm.category) tags.push(fm.category);

  const filename = (parts[parts.length - 1] || '').toLowerCase();
  if (filename === 'readme.md') tags.push('readme');
  if (filename === 'changelog.md') tags.push('changelog');
  if (filename.includes('api')) tags.push('api');
  if (filename.includes('setup') || filename.includes('install')) tags.push('setup');

  return [...new Set(tags)];
}
