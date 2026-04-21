import type { NodeData } from './node.js';

export function renderNodeToMarkdown(node: NodeData): string {
  switch (node.kind) {
    case 'file':
      return renderFileNode(node);
    case 'area':
      return renderAreaNode(node);
    case 'overview':
      return renderOverviewNode(node);
  }
}

function renderFrontmatter(fields: Record<string, unknown>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

function renderFileNode(node: NodeData): string {
  const parts: string[] = [];

  parts.push(renderFrontmatter({
    source: node.source,
    kind: node.fileKind || 'text',
    size: node.size,
    modified: node.modified,
    hash: node.hash,
    tags: node.tags.length > 0 ? node.tags : undefined,
  }));

  const filename = node.source.split('/').pop() || node.source;
  parts.push('', `# ${filename}`);

  if (node.summary) {
    parts.push('', node.summary);
  }

  if (node.exports.length > 0) {
    parts.push('', '## Exports');
    for (const exp of node.exports) {
      const desc = exp.description ? ` — ${exp.description}` : '';
      parts.push(`- \`${exp.name}\` (${exp.kind})${desc}`);
    }
  }

  if (node.dependencies.length > 0) {
    parts.push('', '## Dependencies');
    for (const dep of node.dependencies) {
      const syms = dep.symbols.length > 0 ? ` — ${dep.symbols.join(', ')}` : '';
      parts.push(`- [[${dep.target}]]${syms}`);
    }
  }

  if (node.sections.length > 0) {
    parts.push('', '## Sections');
    for (const section of node.sections) {
      if (section.heading === '(intro)' || section.heading === '(content)') {
        parts.push('', section.content);
      } else {
        parts.push('', `**${section.heading}**: ${section.content}`);
      }
    }
  }

  if (node.structure.length > 0) {
    parts.push('', '## Structure', '');
    parts.push('```');
    parts.push(...node.structure);
    parts.push('```');
  }

  if (node.lineCount !== undefined) {
    parts.push('', `*${node.lineCount} lines*`);
  }

  return parts.join('\n') + '\n';
}

function renderAreaNode(node: NodeData): string {
  const parts: string[] = [];

  const fileCount = node.children.length;
  parts.push(renderFrontmatter({
    kind: 'area',
    files: fileCount,
    tags: node.tags.length > 0 ? node.tags : undefined,
  }));

  parts.push('', `# ${node.source}`);

  if (node.summary) {
    parts.push('', node.summary);
  }

  if (node.children.length > 0) {
    parts.push('', '## Contents', '');
    parts.push('| File | Summary |');
    parts.push('|------|---------|');
    for (const child of node.children) {
      const summary = child.summary || '';
      if (child.fileCount !== undefined) {
        parts.push(`| [[${child.path}]] | ${summary} (${child.fileCount} files) |`);
      } else {
        parts.push(`| [[${child.path}]] | ${summary} |`);
      }
    }
  }

  return parts.join('\n') + '\n';
}

function renderOverviewNode(node: NodeData): string {
  const parts: string[] = [];

  parts.push(renderFrontmatter({
    kind: 'overview',
    project: node.projectName || 'project',
    files_total: node.filesTotal,
  }));

  parts.push('', `# ${node.projectName || 'Project'}`);

  if (node.summary) {
    parts.push('', node.summary);
  }

  if (node.techStack) {
    parts.push('', '## Tech', '', node.techStack);
  }

  if (node.children.length > 0) {
    parts.push('', '## Structure', '');
    parts.push('| Area | Description | Files |');
    parts.push('|------|-------------|-------|');
    for (const child of node.children) {
      const count = child.fileCount ?? '';
      parts.push(`| [[${child.path}]] | ${child.summary || ''} | ${count} |`);
    }
  }

  if (node.entryPoints && node.entryPoints.length > 0) {
    parts.push('', '## Entry Points');
    for (const ep of node.entryPoints) {
      parts.push(`- ${ep}`);
    }
  }

  return parts.join('\n') + '\n';
}
