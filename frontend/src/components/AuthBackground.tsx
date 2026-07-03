"use client";
import { useEffect, useRef } from "react";

interface Route {
  x0: number; y0: number;
  cx0: number; cy0: number;
  cx1: number; cy1: number;
  x1: number; y1: number;
  progress: number;
  speed: number;
  opacity: number;
  fadeDir: number;
  hue: number;
}

function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function makeRoute(W: number, H: number): Route {
  const side = Math.floor(Math.random() * 4);
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
  const edgeRand = () => Math.random();
  if (side === 0) { x0 = edgeRand() * W; y0 = 0; }
  else if (side === 1) { x0 = W; y0 = edgeRand() * H; }
  else if (side === 2) { x0 = edgeRand() * W; y0 = H; }
  else { x0 = 0; y0 = edgeRand() * H; }

  const opp = (side + 2) % 4;
  if (opp === 0) { x1 = edgeRand() * W; y1 = 0; }
  else if (opp === 1) { x1 = W; y1 = edgeRand() * H; }
  else if (opp === 2) { x1 = edgeRand() * W; y1 = H; }
  else { x1 = 0; y1 = edgeRand() * H; }

  const bulge = (Math.random() - 0.5) * 0.6;
  const cx0 = x0 + (x1 - x0) * 0.3 + (y1 - y0) * bulge;
  const cy0 = y0 + (y1 - y0) * 0.3 - (x1 - x0) * bulge;
  const cx1 = x0 + (x1 - x0) * 0.7 + (y1 - y0) * bulge;
  const cy1 = y0 + (y1 - y0) * 0.7 - (x1 - x0) * bulge;

  return {
    x0, y0, cx0, cy0, cx1, cy1, x1, y1,
    progress: Math.random(),
    speed: 0.0008 + Math.random() * 0.0012,
    opacity: Math.random() * 0.4 + 0.1,
    fadeDir: Math.random() > 0.5 ? 1 : -1,
    hue: Math.random() > 0.7 ? 200 : 220,
  };
}

export default function AuthBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;

    const ROUTES = 14;
    let W = 0, H = 0;
    let routes: Route[] = [];

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
      routes = Array.from({ length: ROUTES }, () => makeRoute(W, H));
    }
    resize();
    window.addEventListener("resize", resize);

    // Dot grid (drawn once into offscreen canvas)
    let gridCanvas: HTMLCanvasElement | null = null;
    function buildGrid() {
      gridCanvas = document.createElement("canvas");
      gridCanvas.width = W;
      gridCanvas.height = H;
      const gc = gridCanvas.getContext("2d")!;
      const step = 36;
      gc.fillStyle = "#1a2a40";
      for (let x = 0; x < W; x += step) {
        for (let y = 0; y < H; y += step) {
          gc.beginPath();
          gc.arc(x, y, 0.8, 0, Math.PI * 2);
          gc.fill();
        }
      }
    }
    buildGrid();

    function drawPath(r: Route, trail = false) {
      if (!trail) return;
      ctx.beginPath();
      ctx.moveTo(r.x0, r.y0);
      ctx.bezierCurveTo(r.cx0, r.cy0, r.cx1, r.cy1, r.x1, r.y1);
      ctx.strokeStyle = `hsla(${r.hue}, 70%, 55%, ${r.opacity * 0.18})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function draw() {
      // Background
      ctx.fillStyle = "#0c1220";
      ctx.fillRect(0, 0, W, H);

      // Ambient glow — bottom left corner (port light)
      const glow = ctx.createRadialGradient(W * 0.1, H * 0.85, 0, W * 0.1, H * 0.85, W * 0.45);
      glow.addColorStop(0, "rgba(29,78,216,0.14)");
      glow.addColorStop(1, "rgba(29,78,216,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);

      // Subtle top-right glow
      const glow2 = ctx.createRadialGradient(W * 0.9, H * 0.08, 0, W * 0.9, H * 0.08, W * 0.35);
      glow2.addColorStop(0, "rgba(37,99,235,0.10)");
      glow2.addColorStop(1, "rgba(37,99,235,0)");
      ctx.fillStyle = glow2;
      ctx.fillRect(0, 0, W, H);

      // Dot grid
      if (gridCanvas) ctx.drawImage(gridCanvas, 0, 0);

      // Routes
      for (const r of routes) {
        // Draw trail
        drawPath(r, true);

        // Moving cargo dot position
        const px = cubicBezier(r.progress, r.x0, r.cx0, r.cx1, r.x1);
        const py = cubicBezier(r.progress, r.y0, r.cy0, r.cy1, r.y1);

        // Dot glow
        const dg = ctx.createRadialGradient(px, py, 0, px, py, 12);
        dg.addColorStop(0, `hsla(${r.hue}, 90%, 70%, ${r.opacity * 0.9})`);
        dg.addColorStop(0.4, `hsla(${r.hue}, 80%, 60%, ${r.opacity * 0.4})`);
        dg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = dg;
        ctx.fillRect(px - 12, py - 12, 24, 24);

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${r.hue}, 95%, 80%, ${r.opacity})`;
        ctx.fill();

        // Advance
        r.progress += r.speed;
        if (r.progress > 1) {
          Object.assign(r, makeRoute(W, H));
          r.progress = 0;
        }

        // Fade in/out
        r.opacity += r.fadeDir * 0.002;
        if (r.opacity > 0.7) r.fadeDir = -1;
        if (r.opacity < 0.08) r.fadeDir = 1;
      }

      raf = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
