import type { NodeData, SymbolInfo, DependencyInfo, ChildInfo, SectionInfo } from './node.js';
import { createEmptyNode } from './node.js';

/** Parse an Obsidian-compatible mindmap markdown file back into NodeData */
export function parseMarkdownNode(content: string, source: string): NodeData {
  const { frontmatter, body } = splitFrontmatter(content);
  const kind = detectKind(frontmatter);
  const node = createEmptyNode(source, kind);

  // Parse frontmatter
  node.source = frontmatter['source'] || source;
  node.fileKind = frontmatter['kind'];
  node.size = frontmatter['size'] ? Number(frontmatter['size']) : undefined;
  node.modified = frontmatter['modified'];
  node.hash = frontmatter['hash'];
  node.projectName = frontmatter['project'];
  node.filesTotal = frontmatter['files_total'] ? Number(frontmatter['files_total']) : undefined;

  if (frontmatter['tags']) {
    const tagsStr = frontmatter['tags'];
    const match = tagsStr.match(/\[([^\]]*)\]/);
    if (match) {
      node.tags = match[1].split(',').map((t: string) => t.trim()).filter(Boolean);
    }
  }

  // Parse body sections
  const sections = splitSections(body);

  // Summary: text between title and first ## heading
  if (sections['_intro']) {
    node.summary = sections['_intro'].trim();
  }

  // Exports section
  if (sections['Exports']) {
    node.exports = parseExports(sections['Exports']);
  }

  // Dependencies section
  if (sections['Dependencies']) {
    node.dependencies = parseDependencies(sections['Dependencies']);
  }

  // Contents section (for area nodes)
  if (sections['Contents']) {
    node.children = parseContentsTable(sections['Contents']);
  }

  // Structure section (for area/overview nodes)
  if (sections['Structure'] && kind !== 'file') {
    node.children = parseStructureTable(sections['Structure']);
  }

  // Sections (content summaries)
  if (sections['Sections']) {
    node.sections = parseSections(sections['Sections']);
  }

  // Entry Points
  if (sections['Entry Points']) {
    node.entryPoints = parseListItems(sections['Entry Points']);
  }

  // Tech section
  if (sections['Tech']) {
    node.techStack = sections['Tech'].trim();
  }

  return node;
}

function splitFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const fm: Record<string, string> = {};
  if (!content.startsWith('---')) {
    return { frontmatter: fm, body: content };
  }

  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return { frontmatter: fm, body: content };
  }

  const fmContent = content.slice(4, endIdx);
  const body = content.slice(endIdx + 4);

  for (const line of fmContent.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    fm[key] = value;
  }

  return { frontmatter: fm, body };
}

function detectKind(fm: Record<string, string>): NodeData['kind'] {
  const kind = fm['kind'];
  if (kind === 'overview') return 'overview';
  if (kind === 'area') return 'area';
  return 'file';
}

function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split('\n');
  let currentSection = '_intro';
  let currentContent: string[] = [];
  let afterTitle = false;

  for (const line of lines) {
    if (line.startsWith('# ') && !afterTitle) {
      afterTitle = true;
      continue;
    }
    if (line.startsWith('## ')) {
      sections[currentSection] = currentContent.join('\n');
      currentSection = line.slice(3).trim();
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }
  sections[currentSection] = currentContent.join('\n');

  return sections;
}

function parseExports(text: string): SymbolInfo[] {
  const exports: SymbolInfo[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^- `([^`]+)` \((\w+)\)(?:\s*—\s*(.+))?/);
    if (match) {
      exports.push({
        name: match[1],
        kind: match[2] as SymbolInfo['kind'],
        description: match[3],
      });
    }
  }
  return exports;
}

function parseDependencies(text: string): DependencyInfo[] {
  const deps: DependencyInfo[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^- \[\[([^\]]+)\]\](?:\s*—\s*(.+))?/);
    if (match) {
      deps.push({
        target: match[1],
        symbols: match[2] ? match[2].split(',').map(s => s.trim()) : [],
      });
    }
  }
  return deps;
}

function parseContentsTable(text: string): ChildInfo[] {
  return parseTableWithLinks(text);
}

function parseStructureTable(text: string): ChildInfo[] {
  return parseTableWithLinks(text);
}

function parseTableWithLinks(text: string): ChildInfo[] {
  const children: ChildInfo[] = [];
  for (const line of text.split('\n')) {
    const match = line.match(/\|\s*\[\[([^\]]+)\]\]\s*\|\s*([^|]*)\|(?:\s*(\d+)\s*\|)?/);
    if (match) {
      const child: ChildInfo = {
        path: match[1],
        summary: match[2].trim(),
      };
      if (match[3]) {
        child.fileCount = Number(match[3].trim());
      }
      // Check for "(N files)" in summary
      const filesMatch = child.summary.match(/\((\d+) files\)/);
      if (filesMatch) {
        child.fileCount = Number(filesMatch[1]);
        child.summary = child.summary.replace(/\s*\(\d+ files\)/, '').trim();
      }
      children.push(child);
    }
  }
  return children;
}

function parseSections(text: string): SectionInfo[] {
  const sections: SectionInfo[] = [];

  // Format: **Heading**: content  or  plain content (for intro)
  const lines = text.split('\n').filter(l => l.trim());

  for (const line of lines) {
    const boldMatch = line.match(/^\*\*([^*]+)\*\*:\s*(.+)/);
    if (boldMatch) {
      sections.push({
        heading: boldMatch[1],
        depth: 2,
        content: boldMatch[2].trim(),
      });
    } else if (line.trim() && !line.startsWith('#')) {
      // Plain text — intro/content section
      sections.push({
        heading: '(content)',
        depth: 0,
        content: line.trim(),
      });
    }
  }

  return sections;
}

function parseListItems(text: string): string[] {
  return text
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim());
}
