import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export interface CacheEntry {
  hash: string;
  mtime: number;
  size: number;
}

export interface CacheData {
  [relativePath: string]: CacheEntry;
}

export class IndexCache {
  private data: CacheData = {};
  private indexPath: string;

  constructor(mindmapDir: string) {
    this.indexPath = join(mindmapDir, '_index.json');
  }

  async load(): Promise<void> {
    try {
      const content = await readFile(this.indexPath, 'utf-8');
      this.data = JSON.parse(content);
    } catch {
      this.data = {};
    }
  }

  async save(): Promise<void> {
    await mkdir(dirname(this.indexPath), { recursive: true });
    await writeFile(this.indexPath, JSON.stringify(this.data, null, 2));
  }

  get(relativePath: string): CacheEntry | undefined {
    return this.data[relativePath];
  }

  set(relativePath: string, entry: CacheEntry): void {
    this.data[relativePath] = entry;
  }

  remove(relativePath: string): void {
    delete this.data[relativePath];
  }

  /** Check if a file needs re-extraction */
  needsUpdate(relativePath: string, hash: string): boolean {
    const cached = this.data[relativePath];
    if (!cached) return true;
    return cached.hash !== hash;
  }

  getAllPaths(): string[] {
    return Object.keys(this.data);
  }
}
