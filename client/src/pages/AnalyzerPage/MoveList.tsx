import { MoveMarks, type MoveMarkResult, type MoveMark } from "../../lib/moveMarks.ts";
import { areEvaluationsEqual, formatEvaluation } from "../../lib/evaluation.ts";
import { type MoveNode, type NodeAnalysis, ROOT_ANALYSIS_NODE_ID } from "../../components/ChessReplay.tsx";

export function MoveList({
  setActiveLineId,
  currentNodeId,
  setCurrentNodeId,
  moveMarksMap,
  positionAnalysisMap,
  tree,
  visiblePath,
}: {
  visiblePath: MoveNode[];
  tree: Record<string, MoveNode>;
  currentNodeId: string;
  positionAnalysisMap: Record<string, NodeAnalysis>;
  moveMarksMap: Record<string, MoveMarkResult>;
  setCurrentNodeId: (value: ((prevState: string) => string) | string) => void;
  setActiveLineId: (value: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
      {visiblePath
        .filter(function keepWhiteHalfMove(_, index) {
          return index % 2 === 0;
        })
        .map(function renderMoveRow(whiteNode, rowIndex) {
          const whiteIndex = rowIndex * 2;
          const blackNode = visiblePath[whiteIndex + 1] ?? null;
          const whiteVariations =
            tree[whiteNode.parentId || ROOT_ANALYSIS_NODE_ID]?.children?.map((id) => tree[id]) ||
            Object.values(tree).filter((rootNode) => !rootNode.parentId);
          const blackVariations = blackNode
            ? tree[blackNode.parentId || ROOT_ANALYSIS_NODE_ID]?.children?.map((id) => tree[id]) ||
              Object.values(tree).filter((rootNode) => !rootNode.parentId)
            : [];
          const hasWhiteVariations = whiteVariations.length > 1;
          const hasBlackVariations = blackVariations.length > 1;
          return (
            <div key={whiteNode.id} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <span className="text-[11px] font-bold text-gray-400 w-8 pt-2">{`${rowIndex + 1}.`}</span>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  {[whiteNode, blackNode].map(function renderHalfMove(node, index) {
                    if (!node) {
                      return (
                        <div
                          key={`empty-${rowIndex}-${index}`}
                          className="w-full p-2 rounded border border-transparent"
                        />
                      );
                    }

                    const isFocus = node.id === currentNodeId;
                    const nodeAnalysis = positionAnalysisMap[node.id];
                    const moveMark = moveMarksMap[node.id];

                    return (
                      <button
                        key={node.id}
                        onClick={() => {
                          setCurrentNodeId(node.id);
                        }}
                        className={`w-full flex justify-between items-center p-2 rounded border transition-all ${isFocus ? "bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300" : "bg-white hover:bg-indigo-50 border-gray-200"}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-bold font-mono text-sm">{node.san}</span>
                          {moveMark && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${getMoveMarkBadgeClass(moveMark.mark, isFocus)}`}
                            >
                              {moveMark.mark}
                            </span>
                          )}
                        </span>
                        {nodeAnalysis && (
                          <span className={`text-[10px] font-bold ${isFocus ? "text-indigo-100" : "text-gray-500"}`}>
                            {formatEvaluation(nodeAnalysis.evaluation)}{" "}
                            {nodeAnalysis.depth > 0 && <span className="opacity-50">d{nodeAnalysis.depth}</span>}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              {(hasWhiteVariations || hasBlackVariations) && (
                <div className="ml-10 grid grid-cols-2 gap-2">
                  <div className="min-h-0 border-l-2 border-indigo-100 pl-3 py-1 flex flex-wrap gap-1">
                    {hasWhiteVariations &&
                      whiteVariations.map(function renderWhiteVariation(variation) {
                        if (variation.id === whiteNode.id) return null;
                        return (
                          <button
                            key={variation.id}
                            onClick={() => {
                              setCurrentNodeId(variation.id);
                              setActiveLineId(getDeepestLeaf(variation.id, tree));
                            }}
                            className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
                          >
                            alt: {variation.san}
                          </button>
                        );
                      })}
                  </div>
                  <div className="min-h-0 border-l-2 border-indigo-100 pl-3 py-1 flex flex-wrap gap-1">
                    {hasBlackVariations &&
                      blackVariations.map(function renderBlackVariation(variation) {
                        if (variation.id === blackNode?.id) return null;
                        return (
                          <button
                            key={variation.id}
                            onClick={() => {
                              setCurrentNodeId(variation.id);
                              setActiveLineId(getDeepestLeaf(variation.id, tree));
                            }}
                            className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
                          >
                            alt: {variation.san}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function getMoveMarkBadgeClass(mark: MoveMark, isFocus: boolean): string {
  switch (mark) {
    case MoveMarks.BOOK:
      return isFocus ? "bg-sky-200 text-sky-900" : "bg-sky-100 text-sky-700";
    case MoveMarks.BEST:
      return isFocus ? "bg-green-200 text-green-900" : "bg-green-100 text-green-700";
    case MoveMarks.OK:
      return isFocus ? "bg-gray-200 text-gray-900" : "bg-gray-100 text-gray-700";
    case MoveMarks.INACCURACY:
      return isFocus ? "bg-yellow-200 text-yellow-900" : "bg-yellow-100 text-yellow-800";
    case MoveMarks.MISTAKE:
      return isFocus ? "bg-orange-200 text-orange-900" : "bg-orange-100 text-orange-800";
    case MoveMarks.MISS:
      return isFocus ? "bg-cyan-200 text-cyan-900" : "bg-cyan-100 text-cyan-700";
    case MoveMarks.BLUNDER:
      return isFocus ? "bg-red-200 text-red-900" : "bg-red-100 text-red-700";
    case MoveMarks.ONLY_MOVE:
      return isFocus ? "bg-blue-200 text-blue-900" : "bg-blue-100 text-blue-700";
    case MoveMarks.BRILLIANT:
      return isFocus ? "bg-teal-200 text-teal-900" : "bg-teal-100 text-teal-700";
    default:
      return isFocus ? "bg-gray-200 text-gray-900" : "bg-gray-100 text-gray-700";
  }
}

function getDeepestLeaf(nodeId: string, tree: Record<string, MoveNode>): string {
  const node = tree[nodeId];
  if (!node || node.children.length === 0) return nodeId;
  return getDeepestLeaf(node.children[0], tree);
}
