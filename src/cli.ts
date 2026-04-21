#!/usr/bin/env node

import { resolve } from 'node:path';
import { indexProject } from './indexer/indexer.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MindMapStore } from './mindmap/store.js';
import { queryByTask } from './search/query-engine.js';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  switch (command) {
    case 'index': {
      const path = resolve(args[1] || '.');
      const force = args.includes('--force');
      console.log(`Indexing ${path}...`);
      const result = await indexProject(path, { force });
      console.log(`Done in ${result.elapsedMs}ms:`);
      console.log(`  Indexed: ${result.indexed}`);
      console.log(`  Skipped: ${result.skipped}`);
      console.log(`  Removed: ${result.removed}`);
      console.log(`  Total: ${result.totalFiles} files`);
      console.log(`\nMind map: ${path}/.mindmap/`);
      break;
    }

    case 'overview': {
      const path = resolve(args[1] || '.');
      const overviewPath = join(path, '.mindmap', '_overview.md');
      try {
        console.log(await readFile(overviewPath, 'utf-8'));
      } catch {
        console.error('No mind map found. Run: mindmap index [path]');
      }
      break;
    }

    case 'read': {
      const node = args[1];
      const path = resolve(args[2] || '.');
      if (!node) {
        console.error('Usage: mindmap read <node> [path]');
        process.exit(1);
      }
      const mindmapDir = join(path, '.mindmap');
      // Try file node
      try {
        console.log(await readFile(join(mindmapDir, node + '.md'), 'utf-8'));
        break;
      } catch { /* not a file */ }
      // Try area node
      try {
        console.log(await readFile(join(mindmapDir, node, '_area.md'), 'utf-8'));
        break;
      } catch { /* not an area */ }
      console.error(`Node not found: ${node}`);
      break;
    }

    case 'search': {
      const query = args[1];
      const path = resolve(args[2] || '.');
      if (!query) {
        console.error('Usage: mindmap search <query> [path]');
        process.exit(1);
      }
      const store = new MindMapStore(join(path, '.mindmap'));
      await store.load();
      const results = store.search(query);
      if (results.length === 0) {
        console.log(`No results for "${query}"`);
      } else {
        for (const { node, snippet } of results) {
          const tags = node.tags.length > 0 ? ` [${node.tags.join(', ')}]` : '';
          console.log(`  ${node.source} — ${snippet}${tags}`);
        }
      }
      break;
    }

    case 'query': {
      const task = args[1];
      const path = resolve(args[2] || '.');
      if (!task) {
        console.error('Usage: mindmap query "task description" [path]');
        process.exit(1);
      }
      const store = new MindMapStore(join(path, '.mindmap'));
      await store.load();
      const result = queryByTask(store.getAllNodes(), task);
      console.log(result.rendered);
      break;
    }

    default:
      console.log(`mind-map-context CLI

Usage:
  mindmap index [path] [--force]   Index a project
  mindmap overview [path]          Show project overview
  mindmap read <node> [path]       Read a mind map node
  mindmap search <query> [path]    Search the mind map
  mindmap query "task" [path]      Task-oriented query`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
