import { type MoveMark, type MoveMarkResult, MoveMarks, MoveMarksName, MoveMarksShort } from "../../lib/moveMarks.ts";
import { Evaluations } from "../../lib/evaluation.ts";
import { type MoveNode, type NodeAnalysis, ROOT_ANALYSIS_NODE_ID } from "../../components/ChessReplay.tsx";

namespace MoveListView {
  export type MoveTree = Record<string, MoveNode>;
  export type Row = {
    rowIndex: number;
    whiteNode: MoveNode;
    blackNode: MoveNode | null;
    whiteVariations: MoveNode[];
    blackVariations: MoveNode[];
  };

  export function getVariations(node: MoveNode | null, tree: MoveTree): MoveNode[] {
    if (!node) {
      return [];
    }

    return (
      tree[node.parentId || ROOT_ANALYSIS_NODE_ID]?.children?.map(function mapVariationChild(id) {
        return tree[id];
      }) || getRootNodes(tree)
    );
  }

  export function getRootNodes(tree: MoveTree): MoveNode[] {
    return Object.values(tree).filter(function keepRootNode(rootNode) {
      return !rootNode.parentId;
    });
  }

  export function getRows(visiblePath: MoveNode[], tree: MoveTree): Row[] {
    return visiblePath
      .filter(function keepWhiteHalfMove(_, index) {
        return index % 2 === 0;
      })
      .map(function toRow(whiteNode, rowIndex) {
        const whiteIndex = rowIndex * 2;
        const blackNode = visiblePath[whiteIndex + 1] ?? null;

        return {
          rowIndex,
          whiteNode,
          blackNode,
          whiteVariations: getVariations(whiteNode, tree),
          blackVariations: getVariations(blackNode, tree),
        };
      });
  }
}

export function MoveList({
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
}) {
  const rows = MoveListView.getRows(visiblePath, tree);

  return (
    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
      <MoveListRows
        rows={rows}
        currentNodeId={currentNodeId}
        positionAnalysisMap={positionAnalysisMap}
        moveMarksMap={moveMarksMap}
        setCurrentNodeId={setCurrentNodeId}
      />
    </div>
  );
}

function MoveListRows({
  rows,
  currentNodeId,
  positionAnalysisMap,
  moveMarksMap,
  setCurrentNodeId,
}: {
  rows: MoveListView.Row[];
  currentNodeId: string;
  positionAnalysisMap: Record<string, NodeAnalysis>;
  moveMarksMap: Record<string, MoveMarkResult>;
  setCurrentNodeId: (value: ((prevState: string) => string) | string) => void;
}) {
  return (
    <>
      {rows.map((row) => (
        <MoveRow
          key={row.whiteNode.id}
          row={row}
          currentNodeId={currentNodeId}
          positionAnalysisMap={positionAnalysisMap}
          moveMarksMap={moveMarksMap}
          setCurrentNodeId={setCurrentNodeId}
        />
      ))}
    </>
  );
}

function MoveRow({
  row,
  currentNodeId,
  positionAnalysisMap,
  moveMarksMap,
  setCurrentNodeId,
}: {
  row: MoveListView.Row;
  currentNodeId: string;
  positionAnalysisMap: Record<string, NodeAnalysis>;
  moveMarksMap: Record<string, MoveMarkResult>;
  setCurrentNodeId: (value: ((prevState: string) => string) | string) => void;
}) {
  const hasWhiteVariations = row.whiteVariations.length > 1;
  const hasBlackVariations = row.blackVariations.length > 1;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start">
        <span className="text-[10px] font-bold text-gray-400 pt-2 w-4">{`${row.rowIndex + 1}.`}</span>
        <div className="flex-1 grid grid-cols-2 gap-2">
          <HalfMoveCell
            node={row.whiteNode}
            onSelect={setCurrentNodeId}
            nodeAnalysis={positionAnalysisMap[row.whiteNode.id]}
            isFocus={currentNodeId === row.whiteNode.id}
            moveMark={moveMarksMap[row.whiteNode.id]}
          />
          {!!row.blackNode && (
            <HalfMoveCell
              node={row.blackNode}
              onSelect={setCurrentNodeId}
              nodeAnalysis={positionAnalysisMap[row.blackNode?.id ?? ""]}
              isFocus={currentNodeId === row.blackNode?.id}
              moveMark={moveMarksMap[row.blackNode?.id ?? ""]}
            />
          )}
        </div>
      </div>

      {(hasWhiteVariations || hasBlackVariations) && (
        <div className="ml-10 grid grid-cols-2 gap-2">
          <VariationColumn
            variations={hasWhiteVariations ? row.whiteVariations : []}
            activeNodeId={row.whiteNode.id}
            setCurrentNodeId={setCurrentNodeId}
          />
          <VariationColumn
            variations={hasBlackVariations ? row.blackVariations : []}
            activeNodeId={row.blackNode?.id ?? null}
            setCurrentNodeId={setCurrentNodeId}
          />
        </div>
      )}
    </div>
  );
}

function HalfMoveCell({
  node,
  onSelect,
  nodeAnalysis,
  isFocus,
  moveMark,
}: {
  node: MoveNode | null;
  onSelect: (value: ((prevState: string) => string) | string) => void;
  nodeAnalysis: NodeAnalysis;
  isFocus: boolean;
  moveMark: MoveMarkResult;
}) {
  return (
    <button
      onClick={() => {
        onSelect(node.id);
      }}
      className={`w-full flex relative justify-between items-center p-2 rounded border transition-all ${isFocus ? "bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300" : "bg-white hover:bg-indigo-50 border-gray-200"}`}
    >
      <span className="flex items-center gap-1 overflow-hidden">
        <span className="font-bold font-mono text-md md:text-sm">{node.san}</span>
        {moveMark && (
          <>
            <span
              className={`hidden md:block text-xs px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ellipsis ${getMoveMarkBadgeClass(moveMark.mark, isFocus)}`}
            >
              {MoveMarksName[moveMark.mark]}
            </span>
            <span className={`block md:hidden text-xs`}>
              <img
                src={getMoveMarkIconPath(moveMark.mark)}
                alt={MoveMarksShort[moveMark.mark]}
                className="w-[1em] h-[1-em]"
              />
            </span>
          </>
        )}
      </span>
      {nodeAnalysis && (
        <>
          <div
            className={`flex relative text-sm font-bold flex-nowrap gap-1 items-center ${isFocus ? "text-indigo-100" : "text-gray-500"}`}
          >
            <span>{Evaluations.toString(nodeAnalysis.evaluation)}</span>
            {nodeAnalysis?.depth > 0 && (
              <span className="absolute right-0 bottom-[-1em] opacity-50 text-[7px]">d{nodeAnalysis.depth}</span>
            )}
          </div>
        </>
      )}
    </button>
  );
}

function VariationColumn({
  variations,
  activeNodeId,
  setCurrentNodeId,
}: {
  variations: MoveNode[];
  activeNodeId: string | null;
  setCurrentNodeId: (value: ((prevState: string) => string) | string) => void;
}) {
  return (
    <div className="min-h-0 border-l-2 border-indigo-100 pl-3 py-1 flex flex-wrap gap-1">
      {variations.map(function n(variation) {
        if (variation.id === activeNodeId) {
          return null;
        }

        return (
          <button
            key={variation.id}
            onClick={() => {
              setCurrentNodeId(variation.id);
            }}
            className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors"
          >
            alt: {variation.san}
          </button>
        );
      })}
    </div>
  );
}

function getMoveMarkBadgeClass(mark: MoveMark, isFocus: boolean): string {
  switch (mark) {
    case MoveMarks.BOOK:
      return isFocus ? "bg-taupe-200 text-taupe-900" : "bg-taupe-100 taupe-taupe-700";
    case MoveMarks.BEST:
      return isFocus ? "bg-green-200 text-green-900" : "bg-green-100 text-green-700";
    case MoveMarks.OK:
      return isFocus ? "bg-gray-200 text-gray-900" : "bg-gray-100 text-gray-700";
    case MoveMarks.INACCURACY:
      return isFocus ? "bg-yellow-200 text-yellow-900" : "bg-yellow-100 text-yellow-800";
    case MoveMarks.MISTAKE:
      return isFocus ? "bg-orange-200 text-orange-900" : "bg-orange-100 text-orange-800";
    case MoveMarks.MISS:
      return isFocus ? "bg-red-200 text-red-900" : "bg-red-100 text-red-700";
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

function getMoveMarkIconPath(mark: MoveMark): string {
  switch (mark) {
    case MoveMarks.BOOK:
      return "/movemarks/book.svg";
    case MoveMarks.BEST:
      return "/movemarks/best.svg";
    case MoveMarks.OK:
      return "/movemarks/good.svg";
    case MoveMarks.INACCURACY:
      return "/movemarks/inaccuracy.svg";
    case MoveMarks.MISTAKE:
      return "/movemarks/mistake.svg";
    case MoveMarks.MISS:
      return "/movemarks/miss.svg";
    case MoveMarks.BLUNDER:
      return "/movemarks/blunder.svg";
    case MoveMarks.ONLY_MOVE:
      return "/movemarks/great.svg";
    case MoveMarks.BRILLIANT:
      return "/movemarks/brilliant.svg";
    default:
      return "/movemarks/good.svg";
  }
}
