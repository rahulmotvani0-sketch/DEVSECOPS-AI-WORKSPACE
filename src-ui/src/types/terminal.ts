export type PaneDirection = 'h' | 'v';

export interface PaneNode {
  kind: 'pane';
  id: string;
  sessionId: string | null;
  name: string;
}

export interface SplitNode {
  kind: 'split';
  id: string;
  dir: PaneDirection;
  a: PaneTreeNode;
  b: PaneTreeNode;
}

export type PaneTreeNode = PaneNode | SplitNode;

export interface TerminalTabModel {
  id: string;
  name: string;
  root: PaneTreeNode;
  sync: boolean;
}

export interface TermPaneHandle {
  paneId: string;
  getSessionId: () => string | null;
  getSelection: () => string;
  focus: () => void;
  clear: () => void;
  findNext: () => boolean;
  findPrevious: () => boolean;
}

export const newUuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export const isPane = (node: PaneTreeNode): node is PaneNode => node.kind === 'pane';

export const makePane = (name = 'shell'): PaneNode => ({
  kind: 'pane',
  id: newUuid(),
  sessionId: null,
  name,
});

export const findFirstPane = (node: PaneTreeNode): PaneNode | null => {
  if (isPane(node)) return node;
  return findFirstPane(node.a) ?? findFirstPane(node.b);
};

export const forEachPane = (node: PaneTreeNode | null | undefined, fn: (p: PaneNode) => void): void => {
  if (!node) return;
  if (isPane(node)) {
    fn(node);
    return;
  }
  forEachPane(node.a, fn);
  forEachPane(node.b, fn);
};

export const findPane = (node: PaneTreeNode, paneId: string): PaneNode | null => {
  if (isPane(node)) return node.id === paneId ? node : null;
  return findPane(node.a, paneId) ?? findPane(node.b, paneId);
};

export const withPane = (
  node: PaneTreeNode,
  paneId: string,
  make: (p: PaneNode) => PaneTreeNode
): PaneTreeNode => {
  if (isPane(node)) return node.id === paneId ? make(node) : node;
  return { ...node, a: withPane(node.a, paneId, make), b: withPane(node.b, paneId, make) };
};

export const removePane = (node: PaneTreeNode, paneId: string): PaneTreeNode | null => {
  if (isPane(node)) return node.id === paneId ? null : node;
  const a = removePane(node.a, paneId);
  const b = removePane(node.b, paneId);
  if (a && b) return { ...node, a, b };
  return a ?? b;
};

export const stripSessions = (node: PaneTreeNode): PaneTreeNode =>
  isPane(node)
    ? { ...node, sessionId: null }
    : { ...node, a: stripSessions(node.a), b: stripSessions(node.b) };

export const rebuildLayout = (node: PaneTreeNode): PaneTreeNode =>
  isPane(node)
    ? { kind: 'pane', id: newUuid(), sessionId: null, name: node.name || 'shell' }
    : { kind: 'split', id: newUuid(), dir: node.dir, a: rebuildLayout(node.a), b: rebuildLayout(node.b) };

export const buildChainFromSessions = (sessionIds: string[]): PaneTreeNode => {
  let root: PaneTreeNode = { kind: 'pane', id: newUuid(), sessionId: sessionIds[0] ?? null, name: 'term' };
  for (const sid of sessionIds.slice(1)) {
    root = {
      kind: 'split',
      id: newUuid(),
      dir: 'h',
      a: root,
      b: { kind: 'pane', id: newUuid(), sessionId: sid, name: 'term' },
    };
  }
  return root;
};