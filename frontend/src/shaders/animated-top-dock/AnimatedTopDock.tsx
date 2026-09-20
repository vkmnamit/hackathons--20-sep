import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createTopDockController, type TopDockOptions } from "./topDockController";
import { createRetroPixelField } from "./retroPixelField";
import { createGlassParticleField } from "./glassParticleField";
import "../threeui.css";

export type DockVariant = "modern" | "sable" | "retro" | "glass";

export type DockItem = {
  id: string;
  label: string;
  href?: string;
  badge?: string;
  icon?: string;
  onClick?: () => void;
};

export type AnimatedTopDockProps = Partial<TopDockOptions> & {
  className?: string;
  variant?: DockVariant;
  items?: DockItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
};

const DEFAULT_ITEMS: DockItem[] = [
  { id: "overview", label: "Overview", href: "/app" },
  { id: "map", label: "Network Map", href: "/app/map" },
  { id: "optimize", label: "Solver & AI", href: "/app/optimize" },
  { id: "tradeoff", label: "Cost vs SLAs", href: "/app/tradeoff" },
  { id: "fulfillment", label: "Live Dispatch", href: "/app/fulfillment" },
  { id: "data", label: "Data Hub", href: "/app/data" },
];

const ANIMATED_TOP_DOCK_DEFAULTS: TopDockOptions & { variant: DockVariant } = {
  proximity: 120,
  spring: 0.12,
  damping: 0.82,
  widthGrowth: 28,
  heightGrowth: 10,
  drop: 3,
  variant: "modern",
};

export function AnimatedTopDock({
  className = "",
  variant = "modern",
  items = DEFAULT_ITEMS,
  activeId,
  onSelect,
  ...options
}: AnimatedTopDockProps) {
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Determine current active item from URL pathname or props
  const currentPath = location.pathname;
  const matchedItem = items.find((item) => item.href === currentPath);
  const [selectedId, setSelectedId] = useState<string>(
    activeId || (matchedItem ? matchedItem.id : items[0]?.id || "overview")
  );

  useEffect(() => {
    if (activeId) {
      setSelectedId(activeId);
    } else if (matchedItem) {
      setSelectedId(matchedItem.id);
    }
  }, [activeId, matchedItem]);

  const optionsRef = useRef({ ...ANIMATED_TOP_DOCK_DEFAULTS, ...options, variant });
  optionsRef.current = { ...ANIMATED_TOP_DOCK_DEFAULTS, ...options, variant };

  // Mount Dock Controller for physics spring magnification
  useEffect(() => {
    if (!rootRef.current) return;
    const cleanup = createTopDockController(rootRef.current, () => ({
      ...optionsRef.current,
      axis: variant === "glass" ? "y" : "x",
      distribute: variant === "retro",
      lockTrack: variant === "modern",
    }));
    return cleanup;
  }, [variant]);

  // Mount WebGL Shaders for retro and glass variants
  useEffect(() => {
    if (!canvasRef.current) return;
    if (variant === "retro") {
      const cleanup = createRetroPixelField(canvasRef.current);
      return cleanup;
    }
    if (variant === "glass") {
      const cleanup = createGlassParticleField(canvasRef.current);
      return cleanup;
    }
  }, [variant]);

  return (
    <div
      ref={rootRef}
      className={`animated-top-dock animated-top-dock--${variant} ${className}`}
      data-dock-state="idle"
    >
      {(variant === "retro" || variant === "glass") && (
        <canvas ref={canvasRef} className="animated-top-dock__canvas" />
      )}
      <nav className="animated-top-dock__bar" aria-label="Animated Top Dock Navigation">
        {items.map((item) => {
          const isActive = selectedId === item.id;
          const handleClick = () => {
            setSelectedId(item.id);
            if (item.onClick) item.onClick();
            if (onSelect) onSelect(item.id);
          };

          if (item.href) {
            return (
              <Link
                key={item.id}
                to={item.href}
                data-dock-item
                data-active={isActive ? "true" : "false"}
                className="animated-top-dock__item"
                onClick={handleClick}
              >
                <span>{item.label}</span>
                {item.badge && (
                  <span className="animated-top-dock__item-badge">{item.badge}</span>
                )}
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              data-dock-item
              data-active={isActive ? "true" : "false"}
              className="animated-top-dock__item"
              onClick={handleClick}
            >
              <span>{item.label}</span>
              {item.badge && (
                <span className="animated-top-dock__item-badge">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default AnimatedTopDock;
