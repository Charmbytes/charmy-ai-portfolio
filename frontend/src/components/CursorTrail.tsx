import { useEffect, useRef } from "react";

const HUES = [140, 155, 200, 220, 270, 300, 320, 70, 180, 250];
const TRAIL_MS = 3000;
const MAX_PTS  = 220;
const BLOB_R   = 160;

interface Pt { x: number; y: number; t: number; hue: number; }

export default function CursorTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const trail: Pt[] = [];
    let hueIdx = 0;
    let lastPush = 0;
    let raf: number;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastPush < 10) return;   // ~100fps capture for smoothness
      lastPush = now;
      trail.push({ x: e.clientX, y: e.clientY, t: now, hue: HUES[hueIdx++ % HUES.length] });
      if (trail.length > MAX_PTS) trail.shift();
    };
    window.addEventListener("mousemove", onMove);

    const frame = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = performance.now();

      while (trail.length && now - trail[0].t > TRAIL_MS) trail.shift();

      ctx.globalCompositeOperation = "screen";

      for (const pt of trail) {
        const frac  = 1 - (now - pt.t) / TRAIL_MS;   // 0 = tail, 1 = head
        const alpha = frac * frac * frac * 0.65;       // cubic — lingers bright then drops fast
        const r     = BLOB_R * (0.4 + frac * 0.6);    // head is full size, tail shrinks

        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, r);
        g.addColorStop(0,    `hsla(${pt.hue},100%,75%,${alpha})`);
        g.addColorStop(0.4,  `hsla(${pt.hue},100%,62%,${alpha * 0.4})`);
        g.addColorStop(1,    `hsla(${pt.hue},100%,50%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        filter: "blur(18px) saturate(2)",
        mixBlendMode: "screen",
      }}
    />
  );
}
