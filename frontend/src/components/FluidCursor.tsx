import { useEffect, useRef } from "react";
import WebGLFluidEnhanced from "webgl-fluid-enhanced";

// Widely-spaced hues so each colour has its own distinct region in the fluid
const COLOR_PALETTE = [
  "#22c55e", // green   hue 142
  "#06b6d4", // cyan    hue 192
  "#6366f1", // indigo  hue 239
  "#a855f7", // violet  hue 271
  "#ec4899", // pink    hue 330
];

export default function FluidCursor() {
  // outerRef stays position:fixed (React owns it; library can't touch it).
  // innerRef is handed to WebGLFluidEnhanced which overrides its position to relative.
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const container = innerRef.current!;
    const isMobile  = () => window.innerWidth < 640;

    const sim = new WebGLFluidEnhanced(container);

    sim.setConfig({
      simResolution:       128,
      dyeResolution:       isMobile() ? 512 : 1440,
      densityDissipation:  0.5,
      velocityDissipation: 3,
      pressure:            0.8,
      curl:                30,
      splatRadius:         0.35,
      brightness:          0.08,
      colorUpdateSpeed:    2,     // slow colour cycling → each hue holds longer, more spacing
      transparent:         true,
      colorful:            false,
      colorPalette:        COLOR_PALETTE,
      hover:               false,
      bloom:               false,
      sunrays:             false,
    });

    sim.start();

    // ── Manual pointer forwarding (container has pointer-events: none) ────────
    let lastX = -1;
    let lastY = -1;
    let frameId = 0;

    const onMouseMove = (e: MouseEvent) => {
      const dx = lastX >= 0 ? e.clientX - lastX : 0;
      const dy = lastY >= 0 ? e.clientY - lastY : 0;
      lastX = e.clientX;
      lastY = e.clientY;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      // Batch into rAF so we don't call splatAtLocation more than once per frame
      cancelAnimationFrame(frameId);
      const x = e.clientX, y = e.clientY, vx = dx, vy = dy;
      frameId = requestAnimationFrame(() => sim.splatAtLocation(x, y, vx, vy));
    };

    const onTouchMove = (e: TouchEvent) => {
      for (const t of Array.from(e.touches)) {
        const dx = lastX >= 0 ? t.clientX - lastX : 0;
        const dy = lastY >= 0 ? t.clientY - lastY : 0;
        lastX = t.clientX;
        lastY = t.clientY;
        sim.splatAtLocation(t.clientX, t.clientY, dx, dy);
      }
    };

    const onResize = () => {
      sim.setConfig({ dyeResolution: isMobile() ? 512 : 1440 });
    };

    window.addEventListener("mousemove",  onMouseMove);
    window.addEventListener("touchmove",  onTouchMove, { passive: true });
    window.addEventListener("resize",     onResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove",  onMouseMove);
      window.removeEventListener("touchmove",  onTouchMove);
      window.removeEventListener("resize",     onResize);
      sim.stop();
      // Release the WebGL context so the GPU memory is freed on unmount
      const canvas = container.querySelector<HTMLCanvasElement>("canvas");
      if (canvas) {
        const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
        if (gl) {
          const ext = gl.getExtension("WEBGL_lose_context");
          ext?.loseContext();
        }
        canvas.remove();
      }
    };
  }, []);

  return (
    // Outer div: React owns it, stays position:fixed no matter what the library does.
    <div style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", overflow: "hidden" }}>
      {/* Inner div: handed to the library which overrides position to relative — that's fine inside a fixed parent. */}
      <div ref={innerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
