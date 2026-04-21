export interface NodeData {
  /** Relative path from project root to the source file/directory */
  source: string;
  /** Node kind */
  kind: 'file' | 'area' | 'overview';
  /** Detected file type */
  fileKind?: string;
  /** File size in bytes */
  size?: number;
  /** Last modified timestamp */
  modified?: string;
  /** Content hash for incremental indexing */
  hash?: string;
  /** Auto-generated tags */
  tags: string[];
  /** One-line summary */
  summary: string;
  /** Exported symbols */
  exports: SymbolInfo[];
  /** Dependencies as wiki-link targets */
  dependencies: DependencyInfo[];
  /** Child nodes (for area/overview) */
  children: ChildInfo[];
  /** Raw structure lines (function signatures, etc.) */
  structure: string[];
  /** Content sections with summaries — captures WHAT each section is about */
  sections: SectionInfo[];
  /** Line count of source file */
  lineCount?: number;
  /** Project name (overview only) */
  projectName?: string;
  /** Total file count (overview only) */
  filesTotal?: number;
  /** Tech stack description (overview only) */
  techStack?: string;
  /** Entry points (overview only) */
  entryPoints?: string[];
}

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'type' | 'interface' | 'class' | 'constant' | 'variable' | 'export';
  description?: string;
}

export interface DependencyInfo {
  /** Wiki-link target path (relative to project root) */
  target: string;
  /** What's imported */
  symbols: string[];
}

export interface SectionInfo {
  /** Section heading */
  heading: string;
  /** Heading depth (1-6) */
  depth: number;
  /** Content summary — first 2-3 sentences capturing the meaning */
  content: string;
}

export interface ChildInfo {
  /** Relative path */
  path: string;
  /** One-line summary */
  summary: string;
  /** File count (for areas) */
  fileCount?: number;
}

export function createEmptyNode(source: string, kind: NodeData['kind']): NodeData {
  return {
    source,
    kind,
    tags: [],
    summary: '',
    exports: [],
    dependencies: [],
    children: [],
    structure: [],
    sections: [],
  };
}
