import { z } from 'zod';
import { indexProject } from '../indexer/indexer.js';

export const indexToolSchema = z.object({
  path: z.string().optional().describe('Project root to index. Defaults to cwd.'),
  force: z.boolean().optional().describe('Force full re-index, ignoring cache.'),
  scope: z.string().optional().describe('Glob pattern to limit indexing, e.g. "src/**".'),
});

export type IndexToolInput = z.infer<typeof indexToolSchema>;

export async function handleIndexTool(input: IndexToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const result = await indexProject(projectRoot, {
    force: input.force,
    scope: input.scope,
  });

  return [
    `Indexing complete:`,
    `  Indexed: ${result.indexed} files`,
    `  Skipped (unchanged): ${result.skipped} files`,
    `  Removed (deleted): ${result.removed} files`,
    `  Total: ${result.totalFiles} files`,
    `  Time: ${result.elapsedMs}ms`,
    ``,
    `Mind map written to: ${projectRoot}/.mindmap/`,
  ].join('\n');
}
