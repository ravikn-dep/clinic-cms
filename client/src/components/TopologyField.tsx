import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureKey } from "@/lib/featureAccess";

export type TopologyFieldNode = {
  id: string;
  label: string;
  shortLabel: string;
  value: string | number;
  detail: string;
  feature: FeatureKey;
  accent: string;
  position: [number, number];
};

type TopologyFieldProps = {
  nodes: TopologyFieldNode[];
  isLoading?: boolean;
  isError?: boolean;
};

type Point = { x: number; y: number };

const EDGE_PAIRS: Array<[string, string]> = [
  ["patients", "queue"],
  ["patients", "scribe"],
  ["queue", "pharmacy"],
  ["queue", "orders"],
  ["scribe", "orders"],
  ["pharmacy", "orders"],
  ["patients", "pharmacy"],
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function getTopologyFieldEdges(nodes: TopologyFieldNode[]): Array<[string, string]> {
  const available = new Set(nodes.map((node) => node.id));
  return EDGE_PAIRS.filter(([fromId, toId]) => available.has(fromId) && available.has(toId));
}

export function TopologyField({ nodes, isLoading = false, isError = false }: TopologyFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? "");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const visibleNodes = useMemo(() => nodes.filter(Boolean), [nodes]);
  const selectedNode = visibleNodes.find((node) => node.id === selectedId) ?? visibleNodes[0];

  useEffect(() => {
    if (!visibleNodes.some((node) => node.id === selectedId)) {
      setSelectedId(visibleNodes[0]?.id ?? "");
    }
  }, [selectedId, visibleNodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let isVisible = true;
    let fieldWidth = 0;
    let fieldHeight = 0;
    let devicePixelRatio = 1;

    const resize = () => {
      const bounds = field.getBoundingClientRect();
      fieldWidth = Math.max(280, bounds.width);
      fieldHeight = Math.max(230, bounds.height);
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(fieldWidth * devicePixelRatio);
      canvas.height = Math.floor(fieldHeight * devicePixelRatio);
      canvas.style.width = `${fieldWidth}px`;
      canvas.style.height = `${fieldHeight}px`;
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };

    const pointFor = (node: TopologyFieldNode): Point => ({
      x: node.position[0] * fieldWidth,
      y: node.position[1] * fieldHeight,
    });

    const draw = (time: number) => {
      frameId = 0;
      context.clearRect(0, 0, fieldWidth, fieldHeight);

      const background = context.createLinearGradient(0, 0, fieldWidth, fieldHeight);
      background.addColorStop(0, "#071d1e");
      background.addColorStop(0.52, "#092b2c");
      background.addColorStop(1, "#061516");
      context.fillStyle = background;
      context.fillRect(0, 0, fieldWidth, fieldHeight);

      const centerGlow = context.createRadialGradient(fieldWidth * 0.48, fieldHeight * 0.46, 4, fieldWidth * 0.48, fieldHeight * 0.46, fieldWidth * 0.58);
      centerGlow.addColorStop(0, "rgba(91, 234, 214, 0.16)");
      centerGlow.addColorStop(0.46, "rgba(19, 130, 124, 0.06)");
      centerGlow.addColorStop(1, "rgba(3, 17, 18, 0)");
      context.fillStyle = centerGlow;
      context.fillRect(0, 0, fieldWidth, fieldHeight);

      context.save();
      context.globalAlpha = 0.16;
      context.strokeStyle = "#9ef6e5";
      context.lineWidth = 1;
      const gridSize = 34;
      for (let x = (fieldWidth % gridSize) / 2; x < fieldWidth; x += gridSize) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, fieldHeight);
        context.stroke();
      }
      for (let y = (fieldHeight % gridSize) / 2; y < fieldHeight; y += gridSize) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(fieldWidth, y);
        context.stroke();
      }
      context.restore();

      const byId = new Map(visibleNodes.map((node) => [node.id, node]));
      const phase = reducedMotion.matches || isPaused ? 0.42 : time * 0.00042;

      getTopologyFieldEdges(visibleNodes).forEach(([fromId, toId], edgeIndex) => {
        const from = byId.get(fromId);
        const to = byId.get(toId);
        if (!from || !to) return;
        const start = pointFor(from);
        const end = pointFor(to);
        const isActive = from.id === selectedId || to.id === selectedId || from.id === hoveredId || to.id === hoveredId;

        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.strokeStyle = isActive ? "rgba(171, 255, 235, 0.58)" : "rgba(133, 239, 219, 0.22)";
        context.lineWidth = isActive ? 1.55 : 1;
        context.stroke();

        const pulse = (Math.sin(phase * 2.4 + edgeIndex * 0.9) + 1) / 2;
        const pulsePoint = {
          x: start.x + (end.x - start.x) * pulse,
          y: start.y + (end.y - start.y) * pulse,
        };
        context.beginPath();
        context.arc(pulsePoint.x, pulsePoint.y, isActive ? 2.7 : 1.9, 0, Math.PI * 2);
        context.fillStyle = isActive ? "#d6fff5" : "#7ee8d5";
        context.shadowBlur = isActive ? 14 : 8;
        context.shadowColor = "#66e4cf";
        context.fill();
        context.shadowBlur = 0;
      });

      visibleNodes.forEach((node, index) => {
        const point = pointFor(node);
        const isSelected = node.id === selectedId;
        const isHovered = node.id === hoveredId;
        const radius = isSelected || isHovered ? 8 : 6;
        const breathing = reducedMotion.matches || isPaused ? 0 : Math.sin(phase * 3 + index) * 1.3;

        context.beginPath();
        context.arc(point.x, point.y, radius + 11 + breathing, 0, Math.PI * 2);
        context.strokeStyle = isSelected ? "rgba(202, 255, 244, 0.42)" : "rgba(139, 240, 220, 0.14)";
        context.lineWidth = isSelected ? 1.4 : 1;
        context.stroke();

        const glow = context.createRadialGradient(point.x, point.y, 1, point.x, point.y, radius + 16);
        glow.addColorStop(0, `${node.accent}d9`);
        glow.addColorStop(0.32, `${node.accent}62`);
        glow.addColorStop(1, `${node.accent}00`);
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, radius + 16, 0, Math.PI * 2);
        context.fill();

        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = node.accent;
        context.shadowBlur = isSelected ? 22 : 12;
        context.shadowColor = node.accent;
        context.fill();
        context.shadowBlur = 0;

        context.beginPath();
        context.arc(point.x, point.y, 2.1, 0, Math.PI * 2);
        context.fillStyle = "#effffb";
        context.fill();
      });

      if (!reducedMotion.matches && !isPaused && isVisible) {
        frameId = requestAnimationFrame(draw);
      }
    };

    const observer = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible && !reducedMotion.matches && !isPaused && !frameId) {
        frameId = requestAnimationFrame(draw);
      }
    }, { threshold: 0.05 });

    resize();
    observer.observe(field);
    visibilityObserver.observe(field);
    draw(0);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      visibilityObserver.disconnect();
    };
  }, [hoveredId, isPaused, selectedId, visibleNodes]);

  const updateHoveredNode = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const normalizedX = clamp((clientX - bounds.left) / bounds.width, 0, 1);
    const normalizedY = clamp((clientY - bounds.top) / bounds.height, 0, 1);
    const closest = visibleNodes.reduce<{ id: string | null; distance: number }>((current, node) => {
      const dx = normalizedX - node.position[0];
      const dy = normalizedY - node.position[1];
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance < current.distance ? { id: node.id, distance } : current;
    }, { id: null, distance: Number.POSITIVE_INFINITY });
    setHoveredId(closest.distance < 0.09 ? closest.id : null);
  };

  const selectAdjacent = (direction: 1 | -1) => {
    if (visibleNodes.length === 0) return;
    const currentIndex = Math.max(0, visibleNodes.findIndex((node) => node.id === selectedId));
    const nextIndex = (currentIndex + direction + visibleNodes.length) % visibleNodes.length;
    setSelectedId(visibleNodes[nextIndex].id);
  };

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-teal-900/20 bg-[#061718] text-white shadow-2xl shadow-teal-950/15" aria-labelledby="topology-field-title">
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-200/65">
            <span className="inline-flex items-center gap-2 rounded-full border border-teal-200/20 bg-teal-200/5 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.95)]" />
              Live care network
            </span>
            <span className="text-white/35">Topology Field / {visibleNodes.length} nodes</span>
          </div>
          <h2 id="topology-field-title" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">Care moves through connected moments.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50/60">A live, glanceable map of the clinic workspace. Select a node to see what needs attention without leaving the dashboard.</p>
        </div>
        <button
          type="button"
          onClick={() => setIsPaused((current) => !current)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-xs font-semibold text-teal-50 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-teal-200"
          aria-pressed={isPaused}
        >
          {isPaused ? "Resume field" : "Pause field"}
        </button>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.5fr)_minmax(230px,0.5fr)]">
        <div
          ref={fieldRef}
          className="relative min-h-[250px] border-b border-white/10 sm:min-h-[310px] lg:border-b-0 lg:border-r"
          onPointerMove={(event) => updateHoveredNode(event.clientX, event.clientY)}
          onPointerLeave={() => setHoveredId(null)}
          onClick={() => hoveredId && setSelectedId(hoveredId)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              selectAdjacent(1);
            }
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              selectAdjacent(-1);
            }
            if (event.key === "Enter" && hoveredId) setSelectedId(hoveredId);
          }}
          tabIndex={0}
          role="group"
          aria-label="Interactive topology map of clinic workspace activity. Use arrow keys to move between nodes."
        >
          <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
          <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.16em] text-teal-100/55 backdrop-blur-sm">
            Pointer to inspect · arrows to navigate
          </div>
          {isError && (
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-amber-200/20 bg-amber-950/45 px-3 py-1.5 text-[0.68rem] font-medium text-amber-100/80">
              Telemetry paused · cached signals shown
            </div>
          )}
        </div>

        <div className="flex flex-col justify-between p-5 sm:p-7">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-teal-200/55">Selected signal</p>
            {selectedNode ? (
              <div className="mt-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-3xl font-semibold tracking-tight text-white">{isLoading ? "—" : selectedNode.value}</p>
                    <p className="mt-1 text-sm font-medium text-teal-100/85">{selectedNode.label}</p>
                  </div>
                  <span className="mb-1 h-3 w-3 rounded-full" style={{ backgroundColor: selectedNode.accent, boxShadow: `0 0 18px ${selectedNode.accent}` }} />
                </div>
                <p className="mt-3 text-sm leading-6 text-teal-50/58">{selectedNode.detail}</p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-teal-50/58">Waiting for accessible workspace signals.</p>
            )}
          </div>

          <div className="mt-7 grid grid-cols-2 gap-2">
            {visibleNodes.map((node) => (
              <button
                type="button"
                key={node.id}
                onClick={() => setSelectedId(node.id)}
                className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-200 ${node.id === selectedId ? "border-teal-200/45 bg-teal-200/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.08]"}`}
                aria-pressed={node.id === selectedId}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: node.accent, boxShadow: `0 0 10px ${node.accent}` }} />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white/85">{node.shortLabel}</span>
                  <span className="block truncate text-[0.68rem] text-teal-50/45">{isLoading ? "Syncing" : node.value}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-5 py-3.5 text-[0.68rem] text-teal-50/45 sm:px-7">
        <span>{isLoading ? "Refreshing workspace signals…" : "Signals reflect the current dashboard data"}</span>
        <span className="font-medium text-teal-100/60">Reduced motion is respected automatically</span>
      </div>
    </section>
  );
}
