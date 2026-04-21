import type { NodeData } from '../mindmap/node.js';
import { estimateTokens } from '../utils/tokens.js';
import { renderNodeToMarkdown } from '../mindmap/renderer.js';

export interface QueryResult {
  nodes: NodeData[];
  rendered: string;
  totalTokens: number;
}

/**
 * Task-oriented query engine.
 * Given a natural language task description, finds the most relevant nodes
 * by keyword matching, tag scoring, and dependency graph traversal.
 */
export function queryByTask(
  allNodes: NodeData[],
  task: string,
  maxTokens: number = 3000,
): QueryResult {
  const keywords = extractKeywords(task);
  const scored = scoreNodes(allNodes, keywords);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build result within token budget
  const selected: NodeData[] = [];
  let totalTokens = 0;
  const header = `## Relevant context for: "${task}"\n\n`;
  totalTokens += estimateTokens(header);

  for (const { node } of scored) {
    if (node.kind === 'overview') continue; // Skip overview, agent already has it

    const rendered = renderNodeCompact(node);
    const tokens = estimateTokens(rendered);

    if (totalTokens + tokens > maxTokens) {
      // Try to fit at least a one-liner
      const oneLiner = `- [[${node.source}]] — ${node.summary}\n`;
      const oneLineTokens = estimateTokens(oneLiner);
      if (totalTokens + oneLineTokens <= maxTokens) {
        totalTokens += oneLineTokens;
        selected.push(node);
      }
      continue;
    }

    totalTokens += tokens;
    selected.push(node);
  }

  // Render output
  const parts = [header];

  // Primary matches: full render
  const primary = selected.filter((_, i) => {
    const rendered = renderNodeCompact(_);
    return estimateTokens(rendered) > estimateTokens(`- [[${_.source}]] — ${_.summary}\n`);
  });

  // Secondary matches: one-liners
  const secondary = selected.filter(n => !primary.includes(n));

  if (primary.length > 0) {
    parts.push('### Key files\n');
    for (const node of primary) {
      parts.push(renderNodeCompact(node));
      parts.push('');
    }
  }

  if (secondary.length > 0) {
    parts.push('### Also relevant\n');
    for (const node of secondary) {
      parts.push(`- [[${node.source}]] — ${node.summary}`);
    }
    parts.push('');
  }

  if (selected.length === 0) {
    parts.push('No relevant nodes found. Try mindmap_search with specific keywords.\n');
  }

  const rendered = parts.join('\n');

  return {
    nodes: selected,
    rendered,
    totalTokens: estimateTokens(rendered),
  };
}

/**
 * Extract meaningful keywords from a task description.
 * Strips stop words, splits camelCase/snake_case.
 */
function extractKeywords(task: string): string[] {
  // Normalize
  let text = task.toLowerCase();

  // Split camelCase and snake_case
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  text = text.replace(/_/g, ' ');
  text = text.replace(/[^a-zа-яё0-9\s]/g, ' ');

  const words = text.split(/\s+/).filter(Boolean);

  // Remove stop words
  const stopWords = new Set([
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its', 'the', 'a', 'an',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'at', 'by', 'from',
    'with', 'as', 'into', 'through', 'about', 'between', 'after', 'before',
    'and', 'or', 'but', 'not', 'no', 'if', 'then', 'else', 'when', 'where',
    'how', 'what', 'which', 'who', 'this', 'that', 'these', 'those',
    'all', 'each', 'every', 'any', 'some', 'such', 'only', 'just',
    'also', 'very', 'too', 'so', 'than', 'more', 'most', 'much',
    'want', 'like', 'make', 'get', 'new', 'add', 'change', 'update', 'fix',
    'нужно', 'надо', 'хочу', 'мне', 'как', 'что', 'где', 'для', 'это',
    'добавить', 'изменить', 'сделать', 'нам', 'мы', 'они', 'он', 'она',
  ]);

  return words.filter(w => w.length > 1 && !stopWords.has(w));
}

interface ScoredNode {
  node: NodeData;
  score: number;
}

function scoreNodes(nodes: NodeData[], keywords: string[]): ScoredNode[] {
  if (keywords.length === 0) return [];

  const scored: ScoredNode[] = [];

  for (const node of nodes) {
    let score = 0;

    // Score by path match
    const pathLower = node.source.toLowerCase();
    for (const kw of keywords) {
      if (pathLower.includes(kw)) score += 10;
    }

    // Score by summary match
    const summaryLower = node.summary.toLowerCase();
    for (const kw of keywords) {
      if (summaryLower.includes(kw)) score += 5;
    }

    // Score by tag match
    for (const tag of node.tags) {
      for (const kw of keywords) {
        if (tag.includes(kw) || kw.includes(tag)) score += 8;
      }
    }

    // Score by export name match
    for (const exp of node.exports) {
      const nameLower = exp.name.toLowerCase();
      for (const kw of keywords) {
        if (nameLower.includes(kw)) score += 7;
      }
      if (exp.description) {
        const descLower = exp.description.toLowerCase();
        for (const kw of keywords) {
          if (descLower.includes(kw)) score += 3;
        }
      }
    }

    // Score by dependency — if this node depends on something matching, boost slightly
    for (const dep of node.dependencies) {
      const targetLower = dep.target.toLowerCase();
      for (const kw of keywords) {
        if (targetLower.includes(kw)) score += 2;
      }
    }

    // Boost file nodes over area nodes (more specific)
    if (node.kind === 'file' && score > 0) score += 2;

    // Boost nodes with more exports (more important files)
    if (node.exports.length > 3) score += 1;

    // Penalize noisy files (lock files, generated content)
    const sourceLower = node.source.toLowerCase();
    if (sourceLower.includes('lock.json') || sourceLower.includes('lock.yaml')) {
      score = Math.floor(score * 0.3);
    }

    if (score > 0) {
      scored.push({ node, score });
    }
  }

  // Graph expansion: for top-scored nodes, pull in their dependencies
  const topNodes = scored
    .filter(s => s.score >= 10)
    .slice(0, 5)
    .map(s => s.node);

  const nodeBySource = new Map(nodes.map(n => [n.source, n]));

  for (const topNode of topNodes) {
    for (const dep of topNode.dependencies) {
      const depNode = nodeBySource.get(dep.target);
      if (depNode) {
        const existing = scored.find(s => s.node === depNode);
        if (existing) {
          existing.score += 3; // Boost connected nodes
        } else {
          scored.push({ node: depNode, score: 3 });
        }
      }
    }
  }

  return scored;
}

function renderNodeCompact(node: NodeData): string {
  const parts: string[] = [];

  parts.push(`**[[${node.source}]]**`);
  if (node.summary) parts[0] += ` — ${node.summary}`;

  if (node.exports.length > 0) {
    const expList = node.exports.slice(0, 6).map(e => {
      const desc = e.description ? `: ${e.description}` : '';
      return `\`${e.name}\` (${e.kind}${desc})`;
    });
    if (node.exports.length > 6) expList.push(`+${node.exports.length - 6} more`);
    parts.push(`  Exports: ${expList.join(', ')}`);
  }

  if (node.dependencies.length > 0) {
    const deps = node.dependencies
      .filter(d => !d.target.startsWith('node:') && !d.target.includes('node_modules'))
      .slice(0, 5)
      .map(d => `[[${d.target}]]`);
    if (deps.length > 0) {
      parts.push(`  Deps: ${deps.join(', ')}`);
    }
  }

  if (node.tags.length > 0) {
    parts.push(`  Tags: ${node.tags.join(', ')}`);
  }

  return parts.join('\n');
}
