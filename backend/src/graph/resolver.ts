import { Block } from './types';

/**
 * DFS post-order traversal: parents come before children.
 * Collects all ancestors (via parentLinks) then the block itself.
 */
function resolveBlockDAG(
  blockId: number,
  parentLinks: Map<number, number[]>,
  blockMap: Map<number, Block>,
  visited: Set<number>,
  result: Block[]
): void {
  if (visited.has(blockId)) return;
  visited.add(blockId);

  // Recurse into parents first
  const parents = parentLinks.get(blockId) ?? [];
  for (const pid of parents) {
    resolveBlockDAG(pid, parentLinks, blockMap, visited, result);
  }

  const block = blockMap.get(blockId);
  if (block) result.push(block);
}

export function resolveBlocksWithChains(
  blockIds: number[],
  allBlocks: Block[],
  parentLinks: Map<number, number[]> = new Map()
): Block[] {
  const blockMap = new Map(allBlocks.map((b) => [b.id, b]));
  const visited = new Set<number>();
  const result: Block[] = [];

  for (const id of blockIds) {
    resolveBlockDAG(id, parentLinks, blockMap, visited, result);
  }

  return result;
}
