import { z } from 'zod';
import { join } from 'node:path';
import { MindMapStore } from '../mindmap/store.js';

export const searchToolSchema = z.object({
  query: z.string().describe('Search term (searches node names, content, symbols, tags).'),
  path: z.string().optional().describe('Project root. Defaults to cwd.'),
  limit: z.number().optional().describe('Max results. Default 20.'),
});

export type SearchToolInput = z.infer<typeof searchToolSchema>;

export async function handleSearchTool(input: SearchToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const mindmapDir = join(projectRoot, '.mindmap');

  const store = new MindMapStore(mindmapDir);
  await store.load();

  const results = store.search(input.query, input.limit || 20);

  if (results.length === 0) {
    return `No results found for "${input.query}".`;
  }

  const lines = [`Found ${results.length} result(s) for "${input.query}":\n`];

  for (const { node, snippet } of results) {
    const tags = node.tags.length > 0 ? ` [${node.tags.join(', ')}]` : '';
    lines.push(`- **[[${node.source}]]** — ${snippet}${tags}`);
  }

  lines.push('', 'Use mindmap_read to drill into any of these nodes.');

  return lines.join('\n');
}
