import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

interface MoveNode {
  id: string;        // Path-based ID: "e4|e5|Nf3"
  san: string;       // "Nf3"
  fen: string;       
  parentId: string | null;
  children: string[]; // Order of variations
  evaluation?: { score: string; depth: number };
}

const ChessReplay: React.FC = () => {
  // --- STATE ---
  const [tree, setTree] = useState<Record<string, MoveNode>>({});
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null); // The tip of the current visible path
  const [pgnInput, setPgnInput] = useState('');
  const [status, setStatus] = useState('Interactive Mode');
  const [isThinking, setIsThinking] = useState(false);

  // --- REFS ---
  const engineRef = useRef<Worker | null>(null);
  const treeRef = useRef<Record<string, MoveNode>>({});
  const currentNodeIdRef = useRef<string | null>(null);
  const activeTaskNodeIdRef = useRef<string | null>(null);

  useEffect(() => {
    treeRef.current = tree;
    currentNodeIdRef.current = currentNodeId;
  }, [tree, currentNodeId]);

  // --- ENGINE (Tiered Priority) ---
  const scheduleNextTask = () => {
    if (!engineRef.current) return;
    const currentTree = treeRef.current;
    const focusId = currentNodeIdRef.current;

    const depthTiers = [12, 16, 20, 22];

    for (const d of depthTiers) {
      if (focusId) {
        const node = currentTree[focusId];
        if (node && (!node.evaluation || node.evaluation.depth < d)) {
          runEngine(focusId, d);
          return;
        }
      }
      if (d <= 20) {
        for (const nodeId in currentTree) {
          const node = currentTree[nodeId];
          if (!node.evaluation || node.evaluation.depth < d) {
            runEngine(nodeId, d);
            return;
          }
        }
      }
    }
    setStatus('Analysis Complete');
    setIsThinking(false);
  };

  const runEngine = (nodeId: string, depth: number) => {
    const node = treeRef.current[nodeId];
    if (!node) return;
    setIsThinking(true);
    activeTaskNodeIdRef.current = nodeId;
    engineRef.current?.postMessage(`position fen ${node.fen}`);
    engineRef.current?.postMessage(`go depth ${depth}`);
    setStatus(`Analyzing ${node.san} (d${depth})...`);
  };

  useEffect(() => {
    const worker = new Worker('/stockfish/stockfish.js');
    engineRef.current = worker;
    worker.onmessage = (e) => {
      const line = e.data;
      const nodeId = activeTaskNodeIdRef.current;
      if (line.includes('info') && (line.includes('score cp') || line.includes('score mate'))) {
        let score = '';
        let cpMatch = line.match(/score cp (-?\d+)/);
        let mateMatch = line.match(/score mate (-?\d+)/);
        let depthMatch = line.match(/depth (\d+)/);
        if (cpMatch) score = (parseInt(cpMatch[1]) / 100).toFixed(1);
        else if (mateMatch) score = `M${mateMatch[1]}`;
        if (score && depthMatch && nodeId) {
          const depth = parseInt(depthMatch[1]);
          setTree(prev => {
            const node = prev[nodeId];
            if (!node || (node.evaluation && node.evaluation.depth > depth)) return prev;
            return { ...prev, [nodeId]: { ...node, evaluation: { score, depth } } };
          });
        }
      }
      if (line.startsWith('bestmove')) scheduleNextTask();
    };
    worker.postMessage('uci');
    worker.postMessage('isready');
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    engineRef.current?.postMessage('stop');
    scheduleNextTask();
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

        if (tree[newNodeId]) {
          setCurrentNodeId(newNodeId);
          setActiveLineId(getDeepestLeaf(newNodeId, tree));
          return true;
        }

        const newNode: MoveNode = {
          id: newNodeId,
          san: result.san,
          fen: newFen,
          parentId: currentNodeId,
          children: []
        };

        setTree(prev => {
          const updated = { ...prev, [newNodeId]: newNode };
          if (currentNodeId) {
            // Add new variation to the START of children to make it the "active" branch
            updated[currentNodeId] = {
              ...prev[currentNodeId],
              children: [newNodeId, ...prev[currentNodeId].children.filter(id => id !== newNodeId)]
            };
          }
          return updated;
        });
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

  const onDrop = (sourceSquare: string, targetSquare: string) => {
    return makeMove({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  };

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
          if (lastId) {
            newTree[lastId] = { ...newTree[lastId], children: [...newTree[lastId].children, nodeId] };
          }
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
    setPgnInput(sample);
    importPgn(sample);
  };

  // --- UI HELPERS ---
  const displayFen = useMemo(() => {
    if (!currentNodeId || !tree[currentNodeId]) return 'start';
    return tree[currentNodeId].fen;
  }, [currentNodeId, tree]);

  const visiblePath = useMemo(() => {
    const path: MoveNode[] = [];
    let curr = activeLineId;
    while (curr) {
      const node = tree[curr];
      if (node) {
        path.unshift(node);
        curr = node.parentId;
      } else break;
    }
    return path;
  }, [activeLineId, tree]);

  // Auto-update activeLineId when navigating to ensure the path doesn't "snap" away
  useEffect(() => {
    if (!currentNodeId) return;
    const isOnPath = visiblePath.some(n => n.id === currentNodeId);
    if (!isOnPath) {
      setActiveLineId(getDeepestLeaf(currentNodeId, tree));
    }
  }, [currentNodeId, tree, visiblePath]);

  const getVariations = (parentId: string | null) => {
    if (!parentId) return Object.values(tree).filter(n => n.parentId === null);
    return tree[parentId].children.map(id => tree[id]);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100 min-h-[700px]">
      
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] mb-4 flex items-center justify-between bg-gray-900 text-white p-3 rounded-lg shadow-inner">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Engine Status</span>
            <span className="text-sm font-medium truncate max-w-[200px]">{status}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Eval</span>
            <div className="text-sm font-mono text-indigo-400">
              {currentNodeId && tree[currentNodeId]?.evaluation?.score || '--'}
            </div>
          </div>
        </div>

        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800 relative">
          <Chessboard id="AnalysisBoard" position={displayFen} onPieceDrop={onDrop} boardOrientation="white" animationDuration={200} />
        </div>

        <div className="w-full max-w-[480px] mt-4 flex flex-wrap gap-2 justify-center">
          {currentNodeId && tree[currentNodeId].parentId !== undefined && getVariations(tree[currentNodeId].parentId).length > 1 && (
             <div className="w-full text-center text-[10px] uppercase text-gray-400 font-bold mb-1">Branch Junction</div>
          )}
          {currentNodeId && getVariations(tree[currentNodeId].parentId).map(v => (
            <button key={v.id} onClick={() => { setCurrentNodeId(v.id); setActiveLineId(getDeepestLeaf(v.id, tree)); }} className={`px-3 py-1 rounded text-xs font-bold border transition-all ${v.id === currentNodeId ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>{v.san}</button>
          ))}
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
            <h3 className="font-bold text-gray-800">PGN</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); importPgn(pgnInput); }} className="flex flex-col gap-2">
            <textarea className="w-full h-24 p-2 text-xs font-mono border rounded outline-none bg-white" value={pgnInput} onChange={(e) => setPgnInput(e.target.value)} placeholder="Paste PGN..." />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black">Sync PGN</button>
          </form>
        </div>

        <div className="flex-1 bg-gray-50 p-6 rounded-lg border border-gray-200 flex flex-col overflow-hidden">
          <h3 className="font-bold text-gray-800 mb-4 flex justify-between items-center">Move Tree <button onClick={() => { setTree({}); setCurrentNodeId(null); setActiveLineId(null); setPgnInput(''); }} className="text-[10px] text-red-500 hover:underline">Clear Tree</button></h3>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
            {visiblePath.length === 0 && <div className="text-sm text-gray-400 text-center mt-20 italic">Make a move to start.</div>}
            {visiblePath.map((node, i) => {
              const variations = getVariations(node.parentId);
              const isWhite = i % 2 === 0;
              const moveNum = Math.floor(i / 2) + 1;
              const isFocus = node.id === currentNodeId;

              return (
                <div key={node.id} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 w-8">{isWhite ? `${moveNum}.` : ''}</span>
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
