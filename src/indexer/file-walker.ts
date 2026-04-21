import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import ignore from 'ignore';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.mindmap',
  '.DS_Store',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '__pycache__',
  '.venv',
  'venv',
  '.env',
  'coverage',
  '.cache',
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.webp', '.mp3', '.mp4', '.wav', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.exe', '.dll', '.so', '.dylib',
  '.woff', '.woff2', '.ttf', '.eot',
  '.pyc', '.class', '.o', '.obj',
  '.lock',
]);

export interface FileEntry {
  /** Absolute path */
  absolutePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** File size in bytes */
  size: number;
  /** Last modified ISO string */
  modified: string;
  /** Whether this is a binary file (skip content extraction) */
  isBinary: boolean;
}

export async function walkProject(projectRoot: string): Promise<FileEntry[]> {
  const ig = await loadIgnoreRules(projectRoot);
  const entries: FileEntry[] = [];

  async function walk(dir: string) {
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const absPath = join(dir, item.name);
      const relPath = relative(projectRoot, absPath);

      if (item.isDirectory()) {
        const dirRel = relPath + '/';
        if (ig.ignores(dirRel)) continue;
        await walk(absPath);
      } else if (item.isFile()) {
        if (ig.ignores(relPath)) continue;

        const st = await stat(absPath);
        const ext = getExtension(item.name);
        const isBinary = BINARY_EXTENSIONS.has(ext);

        entries.push({
          absolutePath: absPath,
          relativePath: relPath,
          size: st.size,
          modified: st.mtime.toISOString(),
          isBinary,
        });
      }
    }
  }

  await walk(projectRoot);
  return entries;
}

async function loadIgnoreRules(projectRoot: string) {
  const ig = ignore();
  ig.add(DEFAULT_IGNORE);

  for (const file of ['.gitignore', '.mindmapignore']) {
    try {
      const content = await readFile(join(projectRoot, file), 'utf-8');
      ig.add(content);
    } catch {
      // File doesn't exist, skip
    }
  }

  return ig;
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}
