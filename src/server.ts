import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { indexToolSchema, handleIndexTool } from './tools/index-tool.js';
import { overviewToolSchema, handleOverviewTool } from './tools/overview-tool.js';
import { readToolSchema, handleReadTool } from './tools/read-tool.js';
import { searchToolSchema, handleSearchTool } from './tools/search-tool.js';
import { queryToolSchema, handleQueryTool } from './tools/query-tool.js';
import { diffToolSchema, handleDiffTool } from './tools/diff-tool.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'mind-map-context',
    version: '0.1.0',
  });

  server.tool(
    'mindmap_index',
    'Index a project and build an Obsidian-compatible mind map in .mindmap/. Run this first before using other tools.',
    indexToolSchema.shape,
    async (input) => {
      const result = await handleIndexTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.tool(
    'mindmap_overview',
    'Get a compact project overview from the mind map. Shows tech stack, directory structure, entry points. Read this first to orient yourself.',
    overviewToolSchema.shape,
    async (input) => {
      const result = await handleOverviewTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.tool(
    'mindmap_read',
    'Read a specific mind map node (file or directory). Use [[wiki-links]] from overview/area nodes to navigate. Set depth > 0 to inline child nodes.',
    readToolSchema.shape,
    async (input) => {
      const result = await handleReadTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.tool(
    'mindmap_search',
    'Search the mind map by keyword. Searches file paths, summaries, tags, and symbol names. Returns ranked results.',
    searchToolSchema.shape,
    async (input) => {
      const result = await handleSearchTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.tool(
    'mindmap_query',
    'Task-oriented query: describe what you need to do and get the most relevant files, symbols, and dependencies. Uses keyword matching and graph traversal.',
    queryToolSchema.shape,
    async (input) => {
      const result = await handleQueryTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  server.tool(
    'mindmap_diff',
    'Show what files changed since last indexing. Useful after making edits to see what needs re-indexing.',
    diffToolSchema.shape,
    async (input) => {
      const result = await handleDiffTool(input);
      return { content: [{ type: 'text', text: result }] };
    },
  );

  return server;
}
