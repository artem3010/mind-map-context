/** Approximate token count (chars / 4 heuristic) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
