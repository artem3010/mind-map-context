import type { NodeData } from '../mindmap/node.js';

export interface ExtractResult {
  summary: string;
  tags: string[];
  exports: NodeData['exports'];
  dependencies: NodeData['dependencies'];
  structure: string[];
  sections: NodeData['sections'];
  lineCount: number;
  fileKind: string;
}

export interface Extractor {
  /** Extract structural info from file content */
  extract(filePath: string, content: string): ExtractResult;
}
