import { z } from 'zod';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';

export const readToolSchema = z.object({
  node: z.string().describe('Node path, e.g. "src/auth" or "src/auth/login.ts".'),
  path: z.string().optional().describe('Project root. Defaults to cwd.'),
  depth: z.number().optional().describe('How many levels of children to inline. Default 0 (just this node).'),
});

export type ReadToolInput = z.infer<typeof readToolSchema>;

export async function handleReadTool(input: ReadToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const mindmapDir = join(projectRoot, '.mindmap');
  const depth = input.depth ?? 0;

  // Try reading as a file node first
  const fileNodePath = join(mindmapDir, input.node + '.md');
  try {
    const content = await readFile(fileNodePath, 'utf-8');
    return content;
  } catch { /* not a file node */ }

  // Try reading as an area node
  const areaNodePath = join(mindmapDir, input.node, '_area.md');
  try {
    let content = await readFile(areaNodePath, 'utf-8');

    // If depth > 0, inline child nodes
    if (depth > 0) {
      const children = await getChildContents(mindmapDir, input.node, depth);
      if (children) {
        content += '\n---\n\n' + children;
      }
    }

    return content;
  } catch { /* not an area node */ }

  // Try the root area
  if (input.node === '.' || input.node === '') {
    const rootAreaPath = join(mindmapDir, '_area.md');
    try {
      return await readFile(rootAreaPath, 'utf-8');
    } catch { /* ignore */ }
  }

  return `Node not found: "${input.node}". Use mindmap_overview to see available areas, or mindmap_search to find nodes.`;
}

async function getChildContents(
  mindmapDir: string,
  nodePath: string,
  depth: number,
): Promise<string | null> {
  if (depth <= 0) return null;

  const dir = join(mindmapDir, nodePath);
  let items;
  try {
    items = await readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  const parts: string[] = [];

  for (const item of items) {
    if (!item.isFile() || !item.name.endsWith('.md') || item.name === '_area.md') continue;

    const content = await readFile(join(dir, item.name), 'utf-8');
    parts.push(content);
  }

  // Recurse into subdirectories if depth > 1
  if (depth > 1) {
    for (const item of items) {
      if (!item.isDirectory()) continue;
      const subAreaPath = join(dir, item.name, '_area.md');
      try {
        const content = await readFile(subAreaPath, 'utf-8');
        parts.push(content);
      } catch { /* ignore */ }

      const sub = await getChildContents(mindmapDir, join(nodePath, item.name), depth - 1);
      if (sub) parts.push(sub);
    }
  }

  return parts.length > 0 ? parts.join('\n---\n\n') : null;
}
