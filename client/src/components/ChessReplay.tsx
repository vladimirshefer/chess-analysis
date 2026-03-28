import React, { useState, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

interface MoveEval {
  score: string;
  depth: number;
}

const ChessReplay: React.FC = () => {
  const [pgnInput, setPgnInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [fen, setFen] = useState('start');
  const [status, setStatus] = useState('Ready');
  
  // Analysis state
  const [moveEvals, setMoveEvals] = useState<Record<number, MoveEval>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const engineRef = useRef<Worker | null>(null);
  const analysisQueueRef = useRef<{index: number, depth: number}[]>([]);
  const currentTaskRef = useRef<{index: number, depth: number} | null>(null);
  const historyRef = useRef<string[]>([]);

  // Keep historyRef in sync for the worker closure
  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  // Main task processor (Stable Reference)
  const processNextTask = () => {
    if (analysisQueueRef.current.length === 0) {
      setIsAnalyzing(false);
      currentTaskRef.current = null;
      setStatus('Analysis Complete');
      return;
    }

    const nextTask = analysisQueueRef.current.shift()!;
    currentTaskRef.current = nextTask;
    
    const game = new Chess();
    const currentHistory = historyRef.current;
    
    try {
      for (let i = 0; i <= nextTask.index; i++) {
        game.move(currentHistory[i]);
      }
      
      setStatus(`Analyzing move ${nextTask.index + 1} at depth ${nextTask.depth}...`);
      engineRef.current?.postMessage(`position fen ${game.fen()}`);
      engineRef.current?.postMessage(`go depth ${nextTask.depth}`);
    } catch (err) {
      console.error('Analysis task failed', err);
      processNextTask(); // Skip failed move
    }
  };

  // We use a Ref to store the processor so the worker always calls the "latest" version
  const processorRef = useRef(processNextTask);
  useEffect(() => {
    processorRef.current = processNextTask;
  }, [processNextTask]);

  // Initialize Engine
  useEffect(() => {
    const worker = new Worker('/stockfish/stockfish.js');
    engineRef.current = worker;

    worker.onmessage = (e) => {
      const line = e.data;
      const task = currentTaskRef.current;
      if (!task) return;

      if (line.includes('score cp')) {
        const match = line.match(/score cp (-?\d+)/);
        if (match) {
          const score = (parseInt(match[1]) / 100).toFixed(1);
          setMoveEvals(prev => ({ ...prev, [task.index]: { score, depth: task.depth } }));
        }
      } else if (line.includes('score mate')) {
        const match = line.match(/score mate (-?\d+)/);
        if (match) {
          setMoveEvals(prev => ({ ...prev, [task.index]: { score: `M${match[1]}`, depth: task.depth } }));
        }
      }

      // Move is done when we see 'bestmove'
      if (line.startsWith('bestmove')) {
        processorRef.current();
      }
    };

    worker.postMessage('uci');
    worker.postMessage('isready');

    return () => worker.terminate();
  }, []);

  const startFullAnalysis = () => {
    if (history.length === 0) return;
    
    setIsAnalyzing(true);
    setMoveEvals({});
    
    const queue: {index: number, depth: number}[] = [];
    [12, 16, 20].forEach(depth => {
      for (let i = 0; i < history.length; i++) {
        queue.push({ index: i, depth });
      }
    });
    
    analysisQueueRef.current = queue;
    processNextTask();
  };

  useEffect(() => {
    const game = new Chess();
    for (let i = 0; i <= currentMoveIndex; i++) {
      game.move(history[i]);
    }
    setFen(game.fen());
  }, [currentMoveIndex, history]);

  const handlePgnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgnInput.trim()) return;
    try {
      const temp = new Chess();
      temp.loadPgn(pgnInput);
      setHistory(temp.history());
      setCurrentMoveIndex(-1);
      setMoveEvals({});
      setStatus(`PGN Loaded. ${temp.history().length} moves.`);
    } catch (err) {
      setStatus('Invalid PGN format');
    }
  };

  const loadSample = () => {
    const sample = "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7";
    setPgnInput(sample);
    const temp = new Chess();
    temp.loadPgn(sample);
    setHistory(temp.history());
    setCurrentMoveIndex(-1);
    setMoveEvals({});
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100">
      
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] mb-4 flex items-center justify-between bg-gray-900 text-white p-3 rounded-lg shadow-inner">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">Status</span>
            <span className="text-sm font-medium">{status}</span>
          </div>
          {history.length > 0 && !isAnalyzing && (
            <button 
              onClick={startFullAnalysis}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-xs font-bold transition-colors"
            >
              Analyze Game
            </button>
          )}
          {isAnalyzing && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-mono text-indigo-400">Processing Queue...</span>
            </div>
          )}
        </div>

        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800 relative">
          <Chessboard 
            id="AnalysisBoard"
            position={fen} 
            boardOrientation="white"
            animationDuration={300}
          />
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
            <h3 className="font-bold text-gray-800">PGN Input</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form onSubmit={handlePgnSubmit} className="flex flex-col gap-2">
            <textarea
              className="w-full h-20 p-2 text-xs font-mono border rounded outline-none bg-white"
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
              placeholder="Paste PGN here..."
            />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm hover:bg-black transition-colors">Load PGN</button>
          </form>
        </div>

        <div className="flex-1 bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col min-h-[400px]">
          <h3 className="font-bold text-gray-800 mb-2 flex justify-between">
            Move History 
            <span className="text-[10px] text-gray-400 font-normal self-center">Evaluations update live</span>
          </h3>
          <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 content-start pr-1 custom-scrollbar">
            {history.map((move, i) => {
              const evaluation = moveEvals[i];
              const isWhite = i % 2 === 0;
              const moveNum = Math.floor(i / 2) + 1;
              
              return (
                <button
                  key={i}
                  onClick={() => setCurrentMoveIndex(i)}
                  className={`relative flex flex-col p-2 text-left rounded border transition-all ${
                    currentMoveIndex === i 
                      ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-[1.02] z-10' 
                      : 'bg-white hover:bg-indigo-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-bold ${currentMoveIndex === i ? 'text-indigo-200' : 'text-gray-400'}`}>
                      {moveNum}{isWhite ? '.' : '...'}
                    </span>
                    {evaluation && (
                      <span className={`text-[9px] px-1 rounded font-mono font-bold ${
                        currentMoveIndex === i 
                          ? 'bg-white/20 text-white' 
                          : parseFloat(evaluation.score) >= 0 ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                      }`}>
                        d{evaluation.depth}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold font-mono">{move}</span>
                    <span className={`text-xs font-bold ${currentMoveIndex === i ? 'text-white' : 'text-gray-900'}`}>
                      {evaluation?.score || '--'}
                    </span>
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
