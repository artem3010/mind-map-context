import { z } from 'zod';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

export const overviewToolSchema = z.object({
  path: z.string().optional().describe('Project root. Defaults to cwd.'),
});

export type OverviewToolInput = z.infer<typeof overviewToolSchema>;

export async function handleOverviewTool(input: OverviewToolInput): Promise<string> {
  const projectRoot = input.path || process.cwd();
  const overviewPath = join(projectRoot, '.mindmap', '_overview.md');

  try {
    const content = await readFile(overviewPath, 'utf-8');
    return content;
  } catch {
    return 'No mind map found. Run mindmap_index first to index the project.';
  }
}
