import { useState } from "react";
import { FaGear } from "react-icons/fa6";
import RenderIcon from "../../components/RenderIcon";

export function EngineDepthSelector({
  selectedDepth,
  onSelectDepth,
}: {
  selectedDepth: number;
  onSelectDepth: (depth: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  function selectDepth(depth: number) {
    onSelectDepth(depth);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <button
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm tracking-wide bg-white border-gray-300 hover:bg-gray-100"
        onClick={() => setIsOpen((it) => !it)}
        title={"Engine settings"}
      >
        <RenderIcon iconType={FaGear} className="text-xs" />
      </button>
      {isOpen && (
        <div className="absolute top-full mt-1 z-20 min-w-40 rounded border border-gray-200 bg-white shadow-lg p-1 flex flex-col gap-1">
          <button
            onClick={() => selectDepth(12)}
            className={`px-2 py-1 text-left text-xs rounded ${selectedDepth === 12 ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`}
          >
            Fast (Depth 12)
          </button>
          <button
            onClick={() => selectDepth(16)}
            className={`px-2 py-1 text-left text-xs rounded ${selectedDepth === 16 ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`}
          >
            Normal (Depth 16)
          </button>
          <button
            onClick={() => selectDepth(20)}
            className={`px-2 py-1 text-left text-xs rounded ${selectedDepth === 20 ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`}
          >
            Deep (Depth 20)
          </button>
        </div>
      )}
    </div>
  );
}
