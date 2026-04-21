import { z } from 'zod';
import { join } from 'node:path';
import { MindMapStore } from '../mindmap/store.js';
import { queryByTask } from '../search/query-engine.js';

export const queryToolSchema = z.object({
  task: z.string().describe('Natural language description of the task, e.g. "add authentication to the API".'),
  path: z.string().optional().describe('Project root. Defaults to cwd.'),
  max_tokens: z.number().optional().describe('Token budget for the response. Default 3000.'),
});

export type QueryToolInput = z.infer<typeof queryToolSchema>;

export async function handleQueryTool(input: QueryToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const mindmapDir = join(projectRoot, '.mindmap');

  const store = new MindMapStore(mindmapDir);
  await store.load();

  if (store.getNodeCount() === 0) {
    return 'No mind map found. Run mindmap_index first to index the project.';
  }

  const result = queryByTask(
    store.getAllNodes(),
    input.task,
    input.max_tokens || 3000,
  );

  return result.rendered;
}
