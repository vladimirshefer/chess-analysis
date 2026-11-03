import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { FaBrain, FaChessBoard, FaGear, FaLink, FaMagnifyingGlassPlus, FaRotate, FaRoute } from "react-icons/fa6";
import RenderIcon from "./RenderIcon.tsx";

const DEPTH_OPTIONS = [
  { depth: 12, label: "Fast (Depth 12)" },
  { depth: 16, label: "Normal (Depth 16)" },
  { depth: 20, label: "Deep (Depth 20)" },
];

function itemClass(active: boolean) {
  return `flex items-center gap-2 px-2 py-1 text-left text-xs rounded ${active ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`;
}

function ItemIcon({ icon }: { icon: IconType }) {
  return <RenderIcon iconType={icon} className="shrink-0 w-3.5" />;
}

export function SettingsMenu({
  boardOrientation,
  onRotate,
  selectedDepth,
  onSelectDepth,
  showPlans,
  onToggleArrows,
  deepAnalysisDepth,
  onRunDeepAnalysis,
  shareUrl,
  fen,
}: {
  boardOrientation: "white" | "black";
  onRotate: () => void;
  selectedDepth: number;
  onSelectDepth: (depth: number) => void;
  showPlans: boolean;
  onToggleArrows: () => void;
  deepAnalysisDepth: number;
  onRunDeepAnalysis: () => void;
  shareUrl?: string;
  fen: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"Copied" | "Copy failed" | null>(null);
  const [fenStatus, setFenStatus] = useState<"Copied" | "Copy failed" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(
    function closeOnOutsideClickOrEscape() {
      if (!isOpen) return;
      function handleMouseDown(event: MouseEvent) {
        if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
      }
      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") setIsOpen(false);
      }
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
      return function cleanup() {
        document.removeEventListener("mousedown", handleMouseDown);
        document.removeEventListener("keydown", handleKeyDown);
      };
    },
    [isOpen],
  );

  function runAndClose(action: () => void) {
    action();
    setIsOpen(false);
  }

  async function copyToClipboard(text: string, setStatus: (status: "Copied" | "Copy failed" | null) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Copy failed");
    }
    setTimeout(() => setStatus(null), 1500);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setIsOpen((it) => !it)}
        aria-label="Settings"
        title="Settings"
        className="inline-flex items-center justify-center p-4 bg-gray-800 hover:bg-black text-white rounded font-bold"
      >
        <RenderIcon iconType={FaGear} className="text-base" />
      </button>
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-20 min-w-56 rounded border border-gray-200 bg-white shadow-lg p-1 flex flex-col gap-1">
          <button className={itemClass(false)} onClick={() => runAndClose(onRotate)}>
            <ItemIcon icon={FaRotate} />
            View board as {boardOrientation === "white" ? "Black" : "White"}
          </button>
          {DEPTH_OPTIONS.map(({ depth, label }) => (
            <button key={depth} className={itemClass(selectedDepth === depth)} onClick={() => onSelectDepth(depth)}>
              <ItemIcon icon={FaBrain} />
              {label}
            </button>
          ))}
          <button className={itemClass(showPlans)} onClick={onToggleArrows}>
            <ItemIcon icon={FaRoute} />
            Show plans
          </button>
          <button className={itemClass(false)} onClick={() => runAndClose(onRunDeepAnalysis)}>
            <ItemIcon icon={FaMagnifyingGlassPlus} />
            Ultra-depth analysis ({deepAnalysisDepth})
          </button>
          {shareUrl && (
            <button className={itemClass(false)} onClick={() => copyToClipboard(shareUrl, setShareStatus)}>
              <ItemIcon icon={FaLink} />
              {shareStatus ?? "Share game (copy link)"}
            </button>
          )}
          <button className={itemClass(false)} onClick={() => copyToClipboard(fen, setFenStatus)}>
            <ItemIcon icon={FaChessBoard} />
            {fenStatus ?? "Share position (copy FEN)"}
          </button>
        </div>
      )}
    </div>
  );
}
