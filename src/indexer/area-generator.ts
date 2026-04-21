import type { NodeData, ChildInfo } from '../mindmap/node.js';
import { createEmptyNode } from '../mindmap/node.js';

export interface FileNodeInfo {
  relativePath: string;
  summary: string;
  tags: string[];
}

/** Generate an area node for a directory from its file nodes */
export function generateAreaNode(dirPath: string, files: FileNodeInfo[], subdirs: Map<string, number>): NodeData {
  const node = createEmptyNode(dirPath, 'area');

  // Merge tags from all files
  const tagCounts = new Map<string, number>();
  for (const file of files) {
    for (const tag of file.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  // Keep tags that appear in at least 30% of files or at least 2 files
  const threshold = Math.max(2, Math.floor(files.length * 0.3));
  node.tags = [...tagCounts.entries()]
    .filter(([, count]) => count >= Math.min(threshold, 2))
    .map(([tag]) => tag);

  // Build children list
  const children: ChildInfo[] = [];

  // Subdirectories first
  for (const [subdir, fileCount] of subdirs) {
    children.push({
      path: subdir,
      summary: '',
      fileCount,
    });
  }

  // Then files
  for (const file of files) {
    children.push({
      path: file.relativePath,
      summary: file.summary,
    });
  }

  node.children = children;

  // Generate summary from directory name + file count
  const dirName = dirPath.split('/').pop() || dirPath;
  const totalFiles = files.length;
  node.summary = `${dirName} — ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;

  return node;
}
