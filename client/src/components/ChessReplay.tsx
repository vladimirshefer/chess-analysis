import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

interface MoveEval {
  score: string;
  depth: number;
}

const ChessReplay: React.FC = () => {
  const [history, setHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [pgnInput, setPgnInput] = useState('');
  const [moveEvals, setMoveEvals] = useState<Record<number, MoveEval>>({});
  const [status, setStatus] = useState('Interactive Mode');
  const [isThinking, setIsThinking] = useState(false);
  
  const engineRef = useRef<Worker | null>(null);
  const historyRef = useRef<string[]>([]);
  const currentMoveIndexRef = useRef(-1);
  const moveEvalsRef = useRef<Record<number, MoveEval>>({});
  
  const activeTaskIndexRef = useRef(-1);
  const activeTaskDepthRef = useRef(-1);

  useEffect(() => { 
    historyRef.current = history; 
    currentMoveIndexRef.current = currentMoveIndex;
    moveEvalsRef.current = moveEvals;
  }, [history, currentMoveIndex, moveEvals]);

  // TIERED PRIORITY SCHEDULER
  const scheduleNextTask = () => {
    if (!engineRef.current) return;

    const hist = historyRef.current;
    const evals = moveEvalsRef.current;
    const focusIndex = currentMoveIndexRef.current;

    // Ordered Priority Depths
    const depthTiers = [12, 16, 20, 22];

    for (const d of depthTiers) {
      // 1. Check current move at this depth
      if (focusIndex >= 0) {
        const e = evals[focusIndex];
        if (!e || e.depth < d) {
          runEngine(focusIndex, d);
          return;
        }
      }

      // 2. Check all other moves at this depth (stop others at d20)
      if (d <= 20) {
        for (let i = 0; i < hist.length; i++) {
          const e = evals[i];
          if (!e || e.depth < d) {
            runEngine(i, d);
            return;
          }
        }
      }
    }

    setStatus('All positions analyzed');
    setIsThinking(false);
  };

  const runEngine = (index: number, depth: number) => {
    setIsThinking(true);
    activeTaskIndexRef.current = index;
    activeTaskDepthRef.current = depth;
    
    const game = new Chess();
    const hist = historyRef.current;
    try {
      for (let i = 0; i <= index; i++) game.move(hist[i]);
      setStatus(`Analyzing move ${index + 1} (d${depth})...`);
      engineRef.current?.postMessage(`position fen ${game.fen()}`);
      engineRef.current?.postMessage(`go depth ${depth}`);
    } catch (e) {
      scheduleNextTask();
    }
  };

  useEffect(() => {
    const worker = new Worker('/stockfish/stockfish.js');
    engineRef.current = worker;

    worker.onmessage = (e) => {
      const line = e.data;
      const idx = activeTaskIndexRef.current;
      
      if (line.includes('info') && (line.includes('score cp') || line.includes('score mate'))) {
        let score = '';
        let cpMatch = line.match(/score cp (-?\d+)/);
        let mateMatch = line.match(/score mate (-?\d+)/);
        let depthMatch = line.match(/depth (\d+)/);
        
        if (cpMatch) score = (parseInt(cpMatch[1]) / 100).toFixed(1);
        else if (mateMatch) score = `M${mateMatch[1]}`;
        
        if (score && depthMatch && idx !== -1) {
          const depth = parseInt(depthMatch[1]);
          setMoveEvals(prev => {
            const existing = prev[idx];
            if (!existing || depth >= existing.depth) {
              return { ...prev, [idx]: { score, depth } };
            }
            return prev;
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
    if (history.length > 0) {
      engineRef.current?.postMessage('stop');
      scheduleNextTask();
    }
  }, [history, currentMoveIndex]);

  function onDrop(sourceSquare: string, targetSquare: string) {
    const tempGame = new Chess();
    for (let i = 0; i <= currentMoveIndex; i++) tempGame.move(history[i]);
    try {
      const result = tempGame.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
      if (result) {
        const newHistory = [...history.slice(0, currentMoveIndex + 1), result.san];
        setHistory(newHistory);
        setCurrentMoveIndex(newHistory.length - 1);
        setPgnInput(tempGame.pgn());
        return true;
      }
    } catch (e) { return false; }
    return false;
  }

  const handlePgnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newGame = new Chess();
      newGame.loadPgn(pgnInput);
      setHistory(newGame.history());
      setCurrentMoveIndex(newGame.history().length - 1);
      setMoveEvals({});
    } catch (err) { setStatus('Invalid PGN'); }
  };

  const loadSample = () => {
    const sample = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";
    const newGame = new Chess();
    newGame.loadPgn(sample);
    setHistory(newGame.history());
    setCurrentMoveIndex(newGame.history().length - 1);
    setPgnInput(sample);
  };

  const displayFen = React.useMemo(() => {
    const tempGame = new Chess();
    try {
      for (let i = 0; i <= currentMoveIndex; i++) tempGame.move(history[i]);
      return tempGame.fen();
    } catch (err) { return 'start'; }
  }, [currentMoveIndex, history]);

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100">
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] mb-4 flex items-center justify-between bg-gray-900 text-white p-3 rounded-lg shadow-inner">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Engine Status</span>
            <span className="text-sm font-medium">{status}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isThinking ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
            <span className="text-xs font-mono text-gray-400">{isThinking ? 'Thinking' : 'Idle'}</span>
          </div>
        </div>

        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800 relative">
          <Chessboard id="AnalysisBoard" position={displayFen} onPieceDrop={onDrop} boardOrientation="white" animationDuration={200} />
        </div>
        
        <div className="flex items-center gap-4 mt-6">
          <button onClick={() => setCurrentMoveIndex(-1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">Start</button>
          <button onClick={() => setCurrentMoveIndex(p => Math.max(-1, p - 1))} className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">Prev</button>
          <button onClick={() => setCurrentMoveIndex(p => Math.min(history.length - 1, p + 1))} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold shadow-md">Next</button>
          <button onClick={() => setCurrentMoveIndex(history.length - 1)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold">End</button>
        </div>
      </div>

      <div className="w-full lg:w-[400px] flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">PGN</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form onSubmit={handlePgnSubmit} className="flex flex-col gap-2">
            <textarea className="w-full h-24 p-2 text-xs font-mono border rounded outline-none bg-white" value={pgnInput} onChange={(e) => setPgnInput(e.target.value)} placeholder="Moves appear here..." />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black">Sync PGN</button>
          </form>
        </div>

        <div className="flex-1 bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col min-h-[400px]">
          <h3 className="font-bold text-gray-800 mb-2">Game Analysis</h3>
          <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start pr-1 custom-scrollbar">
            {history.map((move, i) => {
              const evaluation = moveEvals[i];
              const isWhite = i % 2 === 0;
              const moveNum = Math.floor(i / 2) + 1;
              return (
                <button key={i} onClick={() => setCurrentMoveIndex(i)} className={`relative flex flex-col p-2 text-left rounded border transition-all ${currentMoveIndex === i ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.02]' : 'bg-white hover:bg-indigo-50 border-gray-200 text-gray-700'}`}>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold ${currentMoveIndex === i ? 'text-indigo-200' : 'text-gray-400'}`}>{moveNum}{isWhite ? '.' : '...'}</span>
                    {evaluation && <span className={`text-[9px] px-1 rounded font-mono font-bold ${currentMoveIndex === i ? 'bg-white/20 text-white' : 'text-indigo-600 bg-indigo-50'}`}>d{evaluation.depth}</span>}
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold font-mono">{move}</span>
                    <span className={`text-xs font-bold ${currentMoveIndex === i ? 'text-white' : 'text-gray-900'}`}>{evaluation?.score || '--'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessReplay;
