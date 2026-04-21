import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { NodeData } from './node.js';
import { parseMarkdownNode } from './parser.js';

export class MindMapStore {
  private nodes: Map<string, NodeData> = new Map();
  private mindmapDir: string;

  constructor(mindmapDir: string) {
    this.mindmapDir = mindmapDir;
  }

  /** Load all .md files from .mindmap/ into memory */
  async load(): Promise<void> {
    this.nodes.clear();
    await this.loadDir(this.mindmapDir);
  }

  private async loadDir(dir: string): Promise<void> {
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist yet
    }

    for (const item of items) {
      const absPath = join(dir, item.name);
      if (item.isDirectory()) {
        await this.loadDir(absPath);
      } else if (item.isFile() && item.name.endsWith('.md')) {
        const content = await readFile(absPath, 'utf-8');
        const relPath = relative(this.mindmapDir, absPath);
        const source = this.nodePathToSource(relPath);
        const node = parseMarkdownNode(content, source);
        this.nodes.set(source, node);
      }
    }
  }

  /** Convert .mindmap/ relative path to source path */
  private nodePathToSource(relPath: string): string {
    // _overview.md → _overview
    // _area.md → directory path
    // src/auth/login.ts.md → src/auth/login.ts
    if (relPath === '_overview.md') return '_overview';
    if (relPath.endsWith('/_area.md')) return relPath.slice(0, -'/_area.md'.length);
    if (relPath === '_area.md') return '.';
    // Remove trailing .md (the mindmap extension)
    return relPath.slice(0, -3);
  }

  getOverview(): NodeData | undefined {
    return this.nodes.get('_overview');
  }

  getNode(source: string): NodeData | undefined {
    // Try exact match
    if (this.nodes.has(source)) return this.nodes.get(source);
    // Try as area
    const areaNode = this.nodes.get(source);
    if (areaNode) return areaNode;
    return undefined;
  }

  /** Get all nodes matching a prefix (for drilling into a directory) */
  getChildNodes(prefix: string): NodeData[] {
    const results: NodeData[] = [];
    const normalizedPrefix = prefix.endsWith('/') ? prefix : prefix + '/';

    for (const [source, node] of this.nodes) {
      if (source.startsWith(normalizedPrefix) && source !== prefix) {
        results.push(node);
      }
    }
    return results;
  }

  /** Simple text search across all nodes */
  search(query: string, limit = 20): Array<{ node: NodeData; snippet: string }> {
    const queryLower = query.toLowerCase();
    const results: Array<{ node: NodeData; snippet: string; score: number }> = [];

    for (const [_source, node] of this.nodes) {
      let score = 0;
      let snippet = '';

      // Search in source path
      if (node.source.toLowerCase().includes(queryLower)) {
        score += 10;
        snippet = node.source;
      }

      // Search in summary
      if (node.summary.toLowerCase().includes(queryLower)) {
        score += 5;
        snippet = snippet || node.summary;
      }

      // Search in tags
      for (const tag of node.tags) {
        if (tag.toLowerCase().includes(queryLower)) {
          score += 3;
          snippet = snippet || `tag: ${tag}`;
        }
      }

      // Search in exports
      for (const exp of node.exports) {
        if (exp.name.toLowerCase().includes(queryLower)) {
          score += 7;
          snippet = snippet || `${exp.kind}: ${exp.name}`;
        }
      }

      if (score > 0) {
        results.push({ node, snippet, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map(r => ({ node: r.node, snippet: r.snippet }));
  }

  getAllNodes(): NodeData[] {
    return Array.from(this.nodes.values());
  }

  getNodeCount(): number {
    return this.nodes.size;
  }
}
