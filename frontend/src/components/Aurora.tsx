import { useEffect, useRef } from "react";

const BLOBS = [
  { h: 140, ox: 0.0, oy: 0.0 },
  { h: 155, ox: 2.1, oy: 1.3 },
  { h: 200, ox: 1.5, oy: 2.7 },
  { h: 220, ox: 3.8, oy: 0.5 },
  { h: 270, ox: 2.9, oy: 3.1 },
  { h: 300, ox: 5.0, oy: 1.8 },
  { h: 320, ox: 0.7, oy: 4.2 },
  { h: 70,  ox: 4.3, oy: 2.4 },
  { h: 180, ox: 6.1, oy: 3.7 },
  { h: 250, ox: 1.2, oy: 5.5 },
];

export default function Aurora() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let raf: number;
    let t = 0;

    function frame() {
      const w = (canvas.width = window.innerWidth);
      const h = (canvas.height = window.innerHeight);
      const d = Math.min(w, h);

      ctx.fillStyle = "#030306";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "screen";

      BLOBS.forEach(({ h: hue, ox, oy }) => {
        const x = w * (0.5 + Math.sin(t * 0.35 + ox) * 0.42);
        const y = h * (0.5 + Math.cos(t * 0.28 + oy) * 0.36);
        const r = d * (0.44 + Math.sin(t * 0.18 + ox) * 0.1);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0,    `hsla(${hue},100%,62%,0.65)`);
        g.addColorStop(0.4,  `hsla(${hue},100%,52%,0.28)`);
        g.addColorStop(1,    `hsla(${hue},100%,40%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalCompositeOperation = "source-over";
      t += 0.004;
      raf = requestAnimationFrame(frame);
    }

    frame();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        filter: "blur(22px) saturate(1.6)",
      }}
    />
  );
}
