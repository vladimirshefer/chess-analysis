export interface MoveNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;
  children: string[];
}

export type GameNode = MoveNode;

export type GameTree = Record<string, GameNode>;

export namespace GameTreeUtils {
  export function addNode(tree: GameTree, parentId: string | null, newChild: MoveNode): GameTree {
    const nextTree: GameTree = {
      ...tree,
      [newChild.id]: newChild,
    };

    if (parentId) {
      nextTree[parentId] = {
        ...tree[parentId],
        children: [...tree[parentId].children, newChild.id],
      };
    }

    return nextTree;
  }

  export function getPgnToPosition(nodeId: string, tree: GameTree) {
    return getPgnToPosition1(nodeId, tree, new Map<string, string | null>());
  }

  function getPgnToPosition1(nodeId: string, tree: GameTree, cache: Map<string, string | null>): string | null {
    if (cache.has(nodeId)) {
      return cache.get(nodeId) ?? null;
    }

    const node = tree[nodeId];
    if (!node) {
      cache.set(nodeId, null);
      return null;
    }

    if (!node.parentId) {
      const rootPathKey = node.san;
      cache.set(nodeId, rootPathKey);
      return rootPathKey;
    }

    const parentPathKey = getPgnToPosition1(node.parentId, tree, cache);
    if (!parentPathKey) {
      const fallbackPathKey = node.san;
      cache.set(nodeId, fallbackPathKey);
      return fallbackPathKey;
    }

    const nodePathKey = `${parentPathKey} ${node.san}`;
    cache.set(nodeId, nodePathKey);
    return nodePathKey;
  }
}
