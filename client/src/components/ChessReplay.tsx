import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

interface MoveNode {
  id: string;
  san: string;
  fen: string;
  parentId: string | null;
  children: string[];
  evaluation?: NodeEvaluation;
}

interface EngineLine {
  move: string;      
  uci: string;       
  pv: string;        
  score: string;
  depth: number;
  multipv: number;
}

interface PositionSnapshot {
  depth: number;
  evaluation: string;
  pvUCI?: string;
  lines: EngineLine[];
}

interface NodeEvaluation {
  score: string;
  depth: number;
  pvUCI?: string;
  lines?: EngineLine[];
}

interface PendingAnalysis {
  nodeId: string;
  fen: string;
  requestedDepth: number;
  evaluation?: string;
  pvUCI?: string;
  lines: Record<number, EngineLine>;
}

const ChessReplay: React.FC = () => {
  // --- STATE ---
  const [tree, setTree] = useState<Record<string, MoveNode>>({});
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [pgnInput, setPgnInput] = useState('');
  const [status, setStatus] = useState('Interactive Mode');
  const [engineLines, setEngineLines] = useState<EngineLine[]>([]);
  const [positionCache, setPositionCache] = useState<Record<string, PositionSnapshot[]>>({});

  // --- REFS ---
  const engineRef = useRef<Worker | null>(null);
  const treeRef = useRef<Record<string, MoveNode>>({});
  const positionCacheRef = useRef<Record<string, PositionSnapshot[]>>({});
  const currentNodeIdRef = useRef<string | null>(null);
  const activeTaskNodeIdRef = useRef<string | null>(null);
  const activeTaskFenRef = useRef<string>('start');
  const activeTaskDepthRef = useRef(0);
  const pendingAnalysisRef = useRef<PendingAnalysis | null>(null);
  const analysisSessionRef = useRef(0);
  const readySessionRef = useRef(0);

  useEffect(() => {
    treeRef.current = tree;
    positionCacheRef.current = positionCache;
    currentNodeIdRef.current = currentNodeId;
  }, [tree, positionCache, currentNodeId]);

  // --- PGN GENERATION ---
  const generatePgnString = (nodeId: string, moveNum: number, isWhite: boolean, isFirstInVar: boolean, currentTree: Record<string, MoveNode>): string => {
    const node = currentTree[nodeId];
    if (!node) return "";
    let pgn = isWhite ? `${moveNum}. ` : (isFirstInVar ? `${moveNum}... ` : "");
    pgn += node.san + " ";
    if (node.children.length > 1) {
      for (let i = 1; i < node.children.length; i++) {
        pgn += `(${generatePgnString(node.children[i], moveNum, isWhite, true, currentTree).trim()}) `;
      }
    }
    if (node.children.length > 0) {
      pgn += generatePgnString(node.children[0], isWhite ? moveNum : moveNum + 1, !isWhite, false, currentTree);
    }
    return pgn;
  };

  const fullTreePgn = useMemo(() => {
    const roots = Object.values(tree).filter(n => n.parentId === null);
    if (roots.length === 0) return "";
    let result = "";
    roots.forEach((root, i) => {
      result += (i === 0 ? "" : "(") + generatePgnString(root.id, 1, true, i !== 0, tree).trim() + (i === 0 ? " " : ") ");
    });
    return result.trim();
  }, [tree]);

  useEffect(() => { if (fullTreePgn) setPgnInput(fullTreePgn); }, [fullTreePgn]);

  // --- ENGINE HELPERS ---
  const uciToSanLine = (uciString: string, baseFen: string) => {
    const tempGame = new Chess(baseFen === 'start' ? undefined : baseFen);
    const uciMoves = uciString.split(' ');
    let sanMoves: string[] = [];
    for (const u of uciMoves) {
      try {
        const m = tempGame.move({ from: u.substring(0,2), to: u.substring(2,4), promotion: u[4] || 'q' });
        if (m) sanMoves.push(m.san);
        else break;
      } catch(e) { break; }
    }
    return sanMoves;
  };

  const normalizeScoreForWhite = (fen: string, cpScore?: string, mateScore?: string) => {
    const sideToMove = fen === 'start' ? 'w' : fen.split(' ')[1];
    const perspective = sideToMove === 'b' ? -1 : 1;

    if (cpScore) return (parseInt(cpScore, 10) * perspective / 100).toFixed(1);
    if (mateScore) return `M${parseInt(mateScore, 10) * perspective}`;
    return '';
  };

  const getCurrentFen = (nodeId: string | null, currentTree: Record<string, MoveNode>) => nodeId ? currentTree[nodeId]?.fen ?? 'start' : 'start';

  const getBestSnapshot = (fen: string) => {
    const snapshots = positionCacheRef.current[fen] ?? [];
    if (snapshots.length === 0) return null;
    return snapshots.reduce((best, snapshot) => snapshot.depth > best.depth ? snapshot : best);
  };

  const upsertPositionSnapshot = (fen: string, nextSnapshot: PositionSnapshot) => {
    setPositionCache(prev => {
      const existingSnapshots = prev[fen] ?? [];
      const index = existingSnapshots.findIndex(snapshot => snapshot.depth === nextSnapshot.depth);
      const snapshots = [...existingSnapshots];

      if (index >= 0) snapshots[index] = nextSnapshot;
      else snapshots.push(nextSnapshot);

      snapshots.sort((a, b) => a.depth - b.depth);
      return { ...prev, [fen]: snapshots };
    });
  };

  const syncNodeEvaluation = (nodeId: string, evaluation: Partial<NodeEvaluation>) => {
    setTree(prev => {
      const node = prev[nodeId];
      if (!node) return prev;
      const nextEvaluation = {
        score: evaluation.score ?? node.evaluation?.score ?? '',
        depth: evaluation.depth ?? node.evaluation?.depth ?? 0,
        pvUCI: evaluation.pvUCI ?? node.evaluation?.pvUCI,
        lines: evaluation.lines ?? node.evaluation?.lines,
      };
      const currentEvaluation = node.evaluation;
      if (
        currentEvaluation?.score === nextEvaluation.score &&
        currentEvaluation?.depth === nextEvaluation.depth &&
        currentEvaluation?.pvUCI === nextEvaluation.pvUCI &&
        currentEvaluation?.lines === nextEvaluation.lines
      ) {
        return prev;
      }
      return { ...prev, [nodeId]: { ...node, evaluation: nextEvaluation } };
    });
  };

  const scheduleNextTask = () => {
    if (!engineRef.current) return;
    const currentTree = treeRef.current;
    const focusId = currentNodeIdRef.current;
    const depthTiers = [12, 16, 20, 22];

    for (const d of depthTiers) {
      if (focusId) {
        const node = currentTree[focusId];
        const bestSnapshot = node ? getBestSnapshot(node.fen) : null;
        if (node && (!bestSnapshot || bestSnapshot.depth < d)) {
          runEngine(focusId, d);
          return;
        }
      }
      for (const nodeId in currentTree) {
        const node = currentTree[nodeId];
        const bestSnapshot = getBestSnapshot(node.fen);
        if (!bestSnapshot || bestSnapshot.depth < d) {
          runEngine(nodeId, d);
          return;
        }
      }
    }
    setStatus('Analysis Complete');
  };

  const runEngine = (nodeId: string, depth: number) => {
    const node = treeRef.current[nodeId];
    if (!node) return;
    activeTaskNodeIdRef.current = nodeId;
    activeTaskFenRef.current = node.fen;
    activeTaskDepthRef.current = depth;
    pendingAnalysisRef.current = {
      nodeId,
      fen: node.fen,
      requestedDepth: depth,
      lines: {},
    };
    engineRef.current?.postMessage(`setoption name MultiPV value ${nodeId === currentNodeIdRef.current ? 3 : 1}`);
    engineRef.current?.postMessage(`position fen ${node.fen}`);
    engineRef.current?.postMessage(`go depth ${depth}`);
    setStatus(`Analyzing ${node.san || 'start'} (d${depth})...`);
  };

  useEffect(() => {
    const worker = new Worker('/stockfish/stockfish.js');
    engineRef.current = worker;
    worker.onmessage = (e) => {
      const line = e.data;

      if (line === 'readyok') {
        if (readySessionRef.current === analysisSessionRef.current) scheduleNextTask();
        return;
      }

      const nodeId = activeTaskNodeIdRef.current;
      const currentId = currentNodeIdRef.current;
      const activeFen = activeTaskFenRef.current;
      const requestedDepth = activeTaskDepthRef.current;
      const pendingAnalysis = pendingAnalysisRef.current;

      if (line.includes('info') && (line.includes('score cp') || line.includes('score mate'))) {
        let cpMatch = line.match(/score cp (-?\d+)/);
        let mateMatch = line.match(/score mate (-?\d+)/);
        let depthMatch = line.match(/depth (\d+)/);
        let multipvMatch = line.match(/multipv (\d+)/);
        let pvMatch = line.match(/ pv (.+)/);

        let score = normalizeScoreForWhite(activeFen, cpMatch?.[1], mateMatch?.[1]);
        let depth = depthMatch ? parseInt(depthMatch[1]) : 0;
        let multipv = multipvMatch ? parseInt(multipvMatch[1]) : 1;
        let pvUCI = pvMatch ? pvMatch[1] : '';

        if (nodeId && pvUCI && score && depth > 0 && requestedDepth > 0 && pendingAnalysis && pendingAnalysis.nodeId === nodeId && pendingAnalysis.requestedDepth === requestedDepth) {
          const sanMoves = uciToSanLine(pvUCI, activeFen);
          if (sanMoves.length > 0) {
            const newLine: EngineLine = { move: sanMoves[0], uci: pvUCI.split(' ')[0], pv: sanMoves.join(' '), score, depth, multipv };
            pendingAnalysis.lines[multipv] = newLine;
            if (multipv === 1) {
              pendingAnalysis.evaluation = score;
              pendingAnalysis.pvUCI = pvUCI;
            }

            const liveLines = Object.values(pendingAnalysis.lines).sort((a, b) => a.multipv - b.multipv);

            if (nodeId === currentId) {
              setEngineLines(liveLines);
            }
          }
        }
      }
      if (line.startsWith('bestmove')) {
        const finishedAnalysis = pendingAnalysisRef.current;
        if (
          finishedAnalysis &&
          finishedAnalysis.nodeId &&
          finishedAnalysis.requestedDepth > 0 &&
          finishedAnalysis.evaluation
        ) {
          const finishedLines = Object.values(finishedAnalysis.lines).sort((a, b) => a.multipv - b.multipv);
          const snapshot: PositionSnapshot = {
            depth: finishedAnalysis.requestedDepth,
            evaluation: finishedAnalysis.evaluation,
            pvUCI: finishedAnalysis.pvUCI,
            lines: finishedLines,
          };

          upsertPositionSnapshot(finishedAnalysis.fen, snapshot);

          const bestSnapshot = getBestSnapshot(finishedAnalysis.fen);
          const bestDepth = Math.max(bestSnapshot?.depth ?? 0, finishedAnalysis.requestedDepth);
          syncNodeEvaluation(finishedAnalysis.nodeId, {
            score: finishedAnalysis.evaluation,
            depth: bestDepth,
            pvUCI: finishedAnalysis.pvUCI,
            lines: finishedLines,
          });

          if (finishedAnalysis.nodeId === currentId) {
            setEngineLines(finishedLines);
          }
        }
        pendingAnalysisRef.current = null;
        scheduleNextTask();
      }
    };
    worker.postMessage('uci');
    worker.postMessage('isready');
    return () => worker.terminate();
  }, []);

  // Sync current position to cached engine suggestions
  useEffect(() => {
    const currentFen = getCurrentFen(currentNodeId, tree);
    const bestSnapshot = positionCache[currentFen]?.[positionCache[currentFen].length - 1];

    if (bestSnapshot?.lines?.length) {
      setEngineLines(bestSnapshot.lines);
      if (currentNodeId) {
        syncNodeEvaluation(currentNodeId, {
          score: bestSnapshot.evaluation,
          depth: bestSnapshot.depth,
          pvUCI: bestSnapshot.pvUCI,
          lines: bestSnapshot.lines,
        });
      }
    } else {
      const currentPos = tree[currentNodeId || 'start'] || { fen: currentFen };
      if (currentPos.evaluation?.pvUCI) {
        const sanMoves = uciToSanLine(currentPos.evaluation.pvUCI, currentPos.fen);
        if (sanMoves.length > 0) {
          setEngineLines([{
            move: sanMoves[0],
            uci: currentPos.evaluation.pvUCI.split(' ')[0],
            pv: sanMoves.join(' '),
            score: currentPos.evaluation.score,
            depth: currentPos.evaluation.depth,
            multipv: 1
          }]);
        }
      } else {
        setEngineLines([]);
      }
    }
  }, [currentNodeId, positionCache, tree]);

  // Restart engine work when the selected position changes
  useEffect(() => {
    const currentFen = getCurrentFen(currentNodeId, tree);
    engineRef.current?.postMessage('stop');
    activeTaskNodeIdRef.current = null;
    activeTaskFenRef.current = currentFen;
    activeTaskDepthRef.current = 0;
    pendingAnalysisRef.current = null;
    analysisSessionRef.current += 1;
    readySessionRef.current = analysisSessionRef.current;
    engineRef.current?.postMessage('isready');
  }, [currentNodeId]);

  // --- GAME LOGIC ---
  const makeMove = (move: any) => {
    const currentFen = currentNodeId ? tree[currentNodeId].fen : 'start';
    const tempGame = new Chess(currentFen === 'start' ? undefined : currentFen);
    try {
      const result = tempGame.move(move);
      if (result) {
        const newFen = tempGame.fen();
        const newNodeId = currentNodeId ? `${currentNodeId}|${result.san}` : result.san;
        if (!tree[newNodeId]) {
          setTree(prev => {
            const updated = { ...prev, [newNodeId]: { id: newNodeId, san: result.san, fen: newFen, parentId: currentNodeId, children: [] } };
            if (currentNodeId) updated[currentNodeId] = { ...prev[currentNodeId], children: [...prev[currentNodeId].children, newNodeId] };
            return updated;
          });
        }
        setCurrentNodeId(newNodeId);
        setActiveLineId(newNodeId);
        return true;
      }
    } catch (e) { return false; }
    return false;
  };

  const getDeepestLeaf = (nodeId: string, currentTree: Record<string, MoveNode>): string => {
    const node = currentTree[nodeId];
    if (!node || node.children.length === 0) return nodeId;
    return getDeepestLeaf(node.children[0], currentTree);
  };

  const onDrop = (sourceSquare: string, targetSquare: string) => makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });

  const applyEngineMove = (uci: string) => makeMove({ from: uci.substring(0, 2), to: uci.substring(2, 4), promotion: uci[4] || 'q' });

  const importPgn = (pgn: string) => {
    const tempGame = new Chess();
    try {
      tempGame.loadPgn(pgn);
      const moves = tempGame.history();
      let lastId: string | null = null;
      const newTree: Record<string, MoveNode> = { ...tree };
      let walker = new Chess();
      moves.forEach(moveSan => {
        const result = walker.move(moveSan);
        const nodeId = lastId ? `${lastId}|${result.san}` : result.san;
        if (!newTree[nodeId]) {
          newTree[nodeId] = { id: nodeId, san: result.san, fen: walker.fen(), parentId: lastId, children: [] };
          if (lastId) newTree[lastId] = { ...newTree[lastId], children: [...newTree[lastId].children, nodeId] };
        }
        lastId = nodeId;
      });
      setTree(newTree);
      setCurrentNodeId(lastId);
      setActiveLineId(lastId);
      setStatus('PGN Imported');
    } catch (e) { setStatus('Invalid PGN'); }
  };

  const loadSample = () => {
    const sample = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";
    importPgn(sample);
  };

  const visiblePath = useMemo(() => {
    const path: MoveNode[] = [];
    let curr = activeLineId;
    while (curr) {
      const node = tree[curr];
      if (node) { path.unshift(node); curr = node.parentId; } else break;
    }
    return path;
  }, [activeLineId, tree]);

  useEffect(() => {
    if (currentNodeId && !visiblePath.some(n => n.id === currentNodeId)) setActiveLineId(getDeepestLeaf(currentNodeId, tree));
  }, [currentNodeId, tree, visiblePath]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 min-h-[700px]">
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] mb-4 flex items-center justify-between bg-gray-900 text-white p-3 rounded-lg">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-gray-500 font-bold">Engine Status</span>
            <span className="text-sm font-medium truncate max-w-[200px]">{status}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase text-gray-500 font-bold">Eval</span>
            <div className="text-sm font-mono text-indigo-400">{currentNodeId && tree[currentNodeId]?.evaluation?.score || '--'}</div>
          </div>
        </div>
        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800">
          <Chessboard id="AnalysisBoard" position={currentNodeId ? tree[currentNodeId].fen : 'start'} onPieceDrop={onDrop} boardOrientation="white" animationDuration={200} />
        </div>

        <div className="w-full max-w-[480px] mt-6 bg-gray-50 p-4 rounded-lg border border-gray-200">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Engine Suggestions</h3>
          <div className="flex flex-col gap-2">
            {engineLines.length === 0 && <div className="text-xs text-gray-400 italic py-2">Calculating best moves...</div>}
            {engineLines.map((line, idx) => (
              <button key={idx} onClick={() => applyEngineMove(line.uci)} className="flex flex-col gap-1 p-3 bg-white border border-gray-200 rounded hover:border-indigo-500 hover:shadow-sm transition-all text-left">
                <div className="flex justify-between items-center w-full">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-gray-300">{line.multipv}.</span>
                    <span className="font-bold text-gray-800 font-mono text-base">{line.move}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-bold ${parseFloat(line.score) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{line.score}</span>
                    <span className="text-[10px] text-gray-400">d{line.depth}</span>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500 font-mono truncate w-full opacity-70">
                  {line.pv.split(' ').slice(1).join(' ')}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 mt-6">
          <button onClick={() => setCurrentNodeId(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">Start</button>
          <button onClick={() => { if (currentNodeId && tree[currentNodeId]) setCurrentNodeId(tree[currentNodeId].parentId); }} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">Back</button>
          <button disabled={!currentNodeId || tree[currentNodeId].children.length === 0} onClick={() => { if (currentNodeId && tree[currentNodeId].children.length > 0) setCurrentNodeId(tree[currentNodeId].children[0]); }} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold disabled:opacity-30">Forward</button>
        </div>
      </div>

      <div className="w-full lg:w-[450px] flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">Full PGN Tree</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); importPgn(pgnInput); }} className="flex flex-col gap-2">
            <textarea className="w-full h-32 p-2 text-xs font-mono border rounded outline-none bg-white" value={pgnInput} onChange={(e) => setPgnInput(e.target.value)} />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black">Import PGN</button>
          </form>
        </div>

        <div className="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">Move Tree <button onClick={() => { setTree({}); setCurrentNodeId(null); setActiveLineId(null); setPgnInput(''); }} className="text-[10px] text-red-500 hover:underline">Clear Tree</button></h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {visiblePath.map((node, i) => {
              const variations = tree[node.parentId || 'root']?.children?.map(id => tree[id]) || Object.values(tree).filter(n => n.parentId === null);
              const isWhite = i % 2 === 0;
              const isFocus = node.id === currentNodeId;
              return (
                <div key={node.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 w-8">{isWhite ? `${Math.floor(i/2)+1}.` : ''}</span>
                    <button onClick={() => setCurrentNodeId(node.id)} className={`flex-1 flex justify-between items-center p-2 rounded border transition-all ${isFocus ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-300' : 'bg-white hover:bg-indigo-50 border-gray-200'}`}>
                      <span className="font-bold font-mono text-sm">{node.san}</span>
                      {node.evaluation && <span className={`text-[10px] font-bold ${isFocus ? 'text-indigo-100' : 'text-gray-500'}`}>{node.evaluation.score} <span className="opacity-50">d{node.evaluation.depth}</span></span>}
                    </button>
                  </div>
                  {variations.length > 1 && (
                    <div className="ml-10 flex flex-wrap gap-1 border-l-2 border-indigo-100 pl-3 py-1">
                      {variations.map(v => (v.id !== node.id && (
                        <button key={v.id} onClick={() => { setCurrentNodeId(v.id); setActiveLineId(getDeepestLeaf(v.id, tree)); }} className="text-[9px] px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded font-bold transition-colors">alt: {v.san}</button>
                      )))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessReplay;
