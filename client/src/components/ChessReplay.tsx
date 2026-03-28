import React, { useState, useEffect } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';

const ChessReplay: React.FC = () => {
  const [pgnInput, setPgnInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(-1);
  const [fen, setFen] = useState('start');
  const [status, setStatus] = useState('Board initialized');

  // Replay moves logic
  useEffect(() => {
    try {
      const game = new Chess();
      // Re-apply all moves up to current index
      for (let i = 0; i <= currentMoveIndex; i++) {
        const move = game.move(history[i]);
        if (!move) throw new Error(`Move ${i} failed: ${history[i]}`);
      }
      
      const newFen = game.fen();
      console.log('New Position:', newFen);
      setFen(newFen);
      setStatus(`Move ${currentMoveIndex + 1} of ${history.length}`);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    }
  }, [currentMoveIndex, history]);

  const handlePgnSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgnInput.trim()) return;
    try {
      const temp = new Chess();
      temp.loadPgn(pgnInput);
      const moves = temp.history();
      setHistory(moves);
      setCurrentMoveIndex(-1);
      setFen('start');
      setStatus(`PGN Loaded. ${moves.length} moves.`);
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
    setFen('start');
    setStatus('Sample game loaded');
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 p-6 max-w-7xl mx-auto bg-white rounded-xl shadow-lg border border-gray-100">
      
      {/* Chessboard Section */}
      <div className="flex-1 flex flex-col items-center">
        <div className="w-full max-w-[480px] shadow-2xl rounded-lg overflow-hidden border-8 border-gray-800 bg-gray-800 relative">
          {/* 
            REFINED RENDER:
            Removed 'key={fen}' to allow react-chessboard to animate pieces
            between positions instead of destroying the board.
          */}
          <Chessboard 
            id="AnalysisBoard"
            position={fen} 
            boardOrientation="white"
            animationDuration={300}
          />
        </div>
        
        {/* Simple Controls */}
        <div className="flex items-center gap-4 mt-6">
          <button 
            onClick={() => setCurrentMoveIndex(-1)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            Start
          </button>
          <button 
            onClick={() => setCurrentMoveIndex(p => Math.max(-1, p - 1))}
            className="px-6 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            Prev
          </button>
          <button 
            onClick={() => setCurrentMoveIndex(p => Math.min(history.length - 1, p + 1))}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold shadow-md"
          >
            Next
          </button>
          <button 
            onClick={() => setCurrentMoveIndex(history.length - 1)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded font-bold"
          >
            End
          </button>
        </div>
        <div className="mt-4 text-xs font-mono text-gray-500">{status}</div>
      </div>

      {/* Input Section */}
      <div className="w-full lg:w-[350px] flex flex-col gap-4">
        <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-gray-800">Paste PGN</h3>
            <button onClick={loadSample} className="text-[10px] text-indigo-600 font-bold hover:underline">Sample</button>
          </div>
          <form onSubmit={handlePgnSubmit} className="flex flex-col gap-2">
            <textarea
              className="w-full h-24 p-2 text-xs font-mono border rounded outline-none"
              value={pgnInput}
              onChange={(e) => setPgnInput(e.target.value)}
            />
            <button className="py-2 bg-gray-800 text-white font-bold rounded text-sm">Load</button>
          </form>
        </div>

        <div className="flex-1 bg-gray-50 p-4 rounded-lg border border-gray-200 flex flex-col min-h-[250px]">
          <h3 className="font-bold text-gray-800 mb-2">Move History</h3>
          <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1 content-start pr-1">
            {history.map((move, i) => (
              <button
                key={i}
                onClick={() => setCurrentMoveIndex(i)}
                className={`text-xs p-1 text-left rounded border ${
                  currentMoveIndex === i 
                    ? 'bg-indigo-600 text-white border-indigo-700' 
                    : 'bg-white hover:bg-indigo-50 border-gray-200'
                }`}
              >
                <span className="opacity-50 mr-1">{Math.floor(i/2)+1}{i%2===0?'.':'...'}</span>
                {move}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessReplay;
