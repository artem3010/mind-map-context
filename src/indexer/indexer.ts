import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { walkProject, type FileEntry } from './file-walker.js';
import { IndexCache } from './cache.js';
import { getExtractor } from '../extractors/registry.js';
import { hashContent } from '../utils/hash.js';
import { createEmptyNode, type NodeData } from '../mindmap/node.js';
import { renderNodeToMarkdown } from '../mindmap/renderer.js';
import { generateAreaNode, type FileNodeInfo } from './area-generator.js';
import { generateOverviewNode, type AreaSummary } from './overview-generator.js';

export interface IndexResult {
  indexed: number;
  skipped: number;
  removed: number;
  totalFiles: number;
  elapsedMs: number;
}

export async function indexProject(
  projectRoot: string,
  options: { force?: boolean; scope?: string } = {},
): Promise<IndexResult> {
  const start = Date.now();
  const mindmapDir = join(projectRoot, '.mindmap');
  const cache = new IndexCache(mindmapDir);

  if (!options.force) {
    await cache.load();
  }

  // Walk project files
  let files = await walkProject(projectRoot);

  // Apply scope filter if provided
  if (options.scope) {
    const scopePattern = new RegExp(
      options.scope
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
    );
    files = files.filter(f => scopePattern.test(f.relativePath));
  }

  let indexed = 0;
  let skipped = 0;

  // Track directories → files for area generation
  const dirFiles = new Map<string, FileNodeInfo[]>();
  const dirSubdirs = new Map<string, Map<string, number>>();

  // Process each file
  for (const file of files) {
    const fileNode = await processFile(file, projectRoot, mindmapDir, cache, options.force);
    if (fileNode.wasUpdated) {
      indexed++;
    } else {
      skipped++;
    }

    // Track for area generation
    const dir = dirname(file.relativePath);
    if (!dirFiles.has(dir)) {
      dirFiles.set(dir, []);
    }
    dirFiles.get(dir)!.push({
      relativePath: file.relativePath,
      summary: fileNode.summary,
      tags: fileNode.tags,
    });

    // Track subdirectory hierarchy
    registerSubdirs(file.relativePath, dirSubdirs);
  }

  // Remove nodes for deleted files
  const currentPaths = new Set(files.map(f => f.relativePath));
  const cachedPaths = cache.getAllPaths();
  let removed = 0;
  for (const cached of cachedPaths) {
    if (!currentPaths.has(cached)) {
      const nodePath = join(mindmapDir, cached + '.md');
      try {
        await rm(nodePath);
      } catch { /* ignore */ }
      cache.remove(cached);
      removed++;
    }
  }

  // Count total files per directory (including subdirectories)
  const totalFilesPerDir = new Map<string, number>();
  for (const [dir, files] of dirFiles) {
    // Add own files
    totalFilesPerDir.set(dir, (totalFilesPerDir.get(dir) || 0) + files.length);
    // Propagate counts up to parent directories
    const parts = dir.split('/');
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = parts.slice(0, i).join('/');
      totalFilesPerDir.set(parent, (totalFilesPerDir.get(parent) || 0) + files.length);
    }
  }

  // Generate area nodes for each directory
  const areaSummaries: AreaSummary[] = [];
  for (const [dir, files] of dirFiles) {
    const subdirs = dirSubdirs.get(dir) || new Map();
    const areaNode = generateAreaNode(dir, files, subdirs);
    const areaPath = dir === '.' ? join(mindmapDir, '_area.md') : join(mindmapDir, dir, '_area.md');
    await writeNode(areaPath, areaNode);

    // Collect areas for overview (all non-root directories)
    if (dir !== '.') {
      const totalInDir = totalFilesPerDir.get(dir) || files.length;
      areaSummaries.push({
        path: dir,
        summary: areaNode.summary,
        fileCount: totalInDir,
      });
    }
  }

  // Sort areas: top-level first, then alphabetically within each level
  areaSummaries.sort((a, b) => {
    const aDepth = a.path.split('/').length;
    const bDepth = b.path.split('/').length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.path.localeCompare(b.path);
  });

  // Generate overview
  const overviewNode = await generateOverviewNode(projectRoot, areaSummaries, files.length);
  await writeNode(join(mindmapDir, '_overview.md'), overviewNode);

  // Save cache
  await cache.save();

  return {
    indexed,
    skipped,
    removed,
    totalFiles: files.length,
    elapsedMs: Date.now() - start,
  };
}

interface ProcessResult {
  wasUpdated: boolean;
  summary: string;
  tags: string[];
}

async function processFile(
  file: FileEntry,
  projectRoot: string,
  mindmapDir: string,
  cache: IndexCache,
  force?: boolean,
): Promise<ProcessResult> {
  // Read file content
  let content = '';
  if (!file.isBinary) {
    try {
      content = await readFile(file.absolutePath, 'utf-8');
    } catch {
      content = '';
    }
  }

  const hash = file.isBinary ? `binary-${file.size}` : hashContent(content);

  // Check cache
  if (!force && !cache.needsUpdate(file.relativePath, hash)) {
    // Return cached summary (we need it for area generation)
    // For now, re-extract summary cheaply
    const extractor = getExtractor(file.relativePath);
    const result = file.isBinary
      ? { summary: `Binary file (${formatSize(file.size)})`, tags: [], exports: [], dependencies: [], structure: [], lineCount: 0, fileKind: 'binary' }
      : extractor.extract(file.relativePath, content);
    return { wasUpdated: false, summary: result.summary, tags: result.tags };
  }

  // Extract
  const extractor = getExtractor(file.relativePath);
  const result = file.isBinary
    ? { summary: `Binary file (${formatSize(file.size)})`, tags: [], exports: [], dependencies: [], structure: [], lineCount: 0, fileKind: 'binary' }
    : extractor.extract(file.relativePath, content);

  // Build node
  const node = createEmptyNode(file.relativePath, 'file');
  node.fileKind = result.fileKind;
  node.size = file.size;
  node.modified = file.modified;
  node.hash = hash;
  node.tags = result.tags;
  node.summary = result.summary;
  node.exports = result.exports;
  node.dependencies = resolveDependencyPaths(result.dependencies, file.relativePath);
  node.structure = result.structure;
  node.lineCount = result.lineCount;

  // Write node to .mindmap/
  const nodePath = join(mindmapDir, file.relativePath + '.md');
  await writeNode(nodePath, node);

  // Update cache
  cache.set(file.relativePath, {
    hash,
    mtime: new Date(file.modified).getTime(),
    size: file.size,
  });

  return { wasUpdated: true, summary: result.summary, tags: result.tags };
}

async function writeNode(path: string, node: NodeData): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const content = renderNodeToMarkdown(node);
  await writeFile(path, content, 'utf-8');
}

function registerSubdirs(
  filePath: string,
  dirSubdirs: Map<string, Map<string, number>>,
): void {
  const parts = filePath.split('/');
  for (let i = 0; i < parts.length - 1; i++) {
    const parentDir = i === 0 ? '.' : parts.slice(0, i).join('/');
    const childDir = parts.slice(0, i + 1).join('/');

    if (!dirSubdirs.has(parentDir)) {
      dirSubdirs.set(parentDir, new Map());
    }
    const subs = dirSubdirs.get(parentDir)!;
    subs.set(childDir, (subs.get(childDir) || 0) + 1);
  }
}

import type { DependencyInfo } from '../mindmap/node.js';

function resolveDependencyPaths(deps: DependencyInfo[], filePath: string): DependencyInfo[] {
  const fileDir = dirname(filePath);

  return deps.map(dep => {
    const resolved = resolveImportPath(dep.target, fileDir);
    return { ...dep, target: resolved };
  });
}

function resolveImportPath(importPath: string, fromDir: string): string {
  // Keep non-relative imports as-is (npm packages, aliases)
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // Resolve relative path
  const parts = fromDir.split('/').filter(Boolean);
  const importParts = importPath.split('/');

  for (const part of importParts) {
    if (part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  let resolved = parts.join('/');

  // Strip .js/.mjs/.cjs extension (source is likely .ts)
  resolved = resolved.replace(/\.(js|mjs|cjs)$/, '.ts');

  return resolved;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
