import { useEffect, useRef, useState } from "react";
import { FaGear } from "react-icons/fa6";
import RenderIcon from "./RenderIcon.tsx";

const DEPTH_OPTIONS = [
  { depth: 12, label: "Fast (Depth 12)" },
  { depth: 16, label: "Normal (Depth 16)" },
  { depth: 20, label: "Deep (Depth 20)" },
];

function itemClass(active: boolean) {
  return `px-2 py-1 text-left text-xs rounded ${active ? "bg-blue-50 text-blue-700 font-bold" : "text-gray-700 hover:bg-gray-100"}`;
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
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<"Copied" | "Copy failed" | null>(null);
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

  async function share() {
    try {
      await navigator.clipboard.writeText(shareUrl!);
      setShareStatus("Copied");
    } catch {
      setShareStatus("Copy failed");
    }
    setTimeout(() => setShareStatus(null), 1500);
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
            View board as {boardOrientation === "white" ? "Black" : "White"}
          </button>
          {DEPTH_OPTIONS.map(({ depth, label }) => (
            <button key={depth} className={itemClass(selectedDepth === depth)} onClick={() => onSelectDepth(depth)}>
              {label}
            </button>
          ))}
          <button className={itemClass(showPlans)} onClick={onToggleArrows}>
            {showPlans ? "✓ " : ""}Show engine arrows
          </button>
          <button className={itemClass(false)} onClick={() => runAndClose(onRunDeepAnalysis)}>
            Ultra-depth analysis ({deepAnalysisDepth})
          </button>
          {shareUrl && (
            <button className={itemClass(false)} onClick={share}>
              {shareStatus ?? "Share game (copy link)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
