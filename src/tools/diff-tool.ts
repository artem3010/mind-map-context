import { z } from 'zod';
import { join } from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { walkProject } from '../indexer/file-walker.js';
import { hashContent } from '../utils/hash.js';
import type { CacheData } from '../indexer/cache.js';

export const diffToolSchema = z.object({
  path: z.string().optional().describe('Project root. Defaults to cwd.'),
});

export type DiffToolInput = z.infer<typeof diffToolSchema>;

interface DiffResult {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: number;
}

export async function handleDiffTool(input: DiffToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const mindmapDir = join(projectRoot, '.mindmap');
  const indexPath = join(mindmapDir, '_index.json');

  // Load cached index
  let cache: CacheData;
  try {
    const content = await readFile(indexPath, 'utf-8');
    cache = JSON.parse(content);
  } catch {
    return 'No previous index found. Run mindmap_index first.';
  }

  // Walk current files
  const files = await walkProject(projectRoot);

  const result: DiffResult = {
    added: [],
    removed: [],
    modified: [],
    unchanged: 0,
  };

  const currentPaths = new Set<string>();

  for (const file of files) {
    currentPaths.add(file.relativePath);
    const cached = cache[file.relativePath];

    if (!cached) {
      result.added.push(file.relativePath);
      continue;
    }

    // Check if file changed
    if (cached.size !== file.size || cached.mtime !== new Date(file.modified).getTime()) {
      // Size or mtime changed — check hash
      if (!file.isBinary) {
        try {
          const content = await readFile(file.absolutePath, 'utf-8');
          const hash = hashContent(content);
          if (hash !== cached.hash) {
            result.modified.push(file.relativePath);
          } else {
            result.unchanged++;
          }
        } catch {
          result.modified.push(file.relativePath);
        }
      } else {
        result.modified.push(file.relativePath);
      }
    } else {
      result.unchanged++;
    }
  }

  // Find removed files
  for (const cachedPath of Object.keys(cache)) {
    if (!currentPaths.has(cachedPath)) {
      result.removed.push(cachedPath);
    }
  }

  // Format output
  const lines: string[] = [];

  if (result.added.length === 0 && result.removed.length === 0 && result.modified.length === 0) {
    lines.push('No changes since last index.');
    lines.push(`${result.unchanged} files unchanged.`);
    return lines.join('\n');
  }

  lines.push(`Changes since last index:\n`);

  if (result.added.length > 0) {
    lines.push(`### Added (${result.added.length})`);
    for (const f of result.added.slice(0, 30)) {
      lines.push(`+ ${f}`);
    }
    if (result.added.length > 30) lines.push(`  ...and ${result.added.length - 30} more`);
    lines.push('');
  }

  if (result.modified.length > 0) {
    lines.push(`### Modified (${result.modified.length})`);
    for (const f of result.modified.slice(0, 30)) {
      lines.push(`~ ${f}`);
    }
    if (result.modified.length > 30) lines.push(`  ...and ${result.modified.length - 30} more`);
    lines.push('');
  }

  if (result.removed.length > 0) {
    lines.push(`### Removed (${result.removed.length})`);
    for (const f of result.removed.slice(0, 30)) {
      lines.push(`- ${f}`);
    }
    if (result.removed.length > 30) lines.push(`  ...and ${result.removed.length - 30} more`);
    lines.push('');
  }

  lines.push(`Unchanged: ${result.unchanged}`);
  lines.push('');
  lines.push('Run mindmap_index to update the mind map.');

  return lines.join('\n');
}
