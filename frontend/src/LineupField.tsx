import { useEffect, useRef } from "react";

// Bespoke canvas-2D background for Trueview: a slow drifting field of
// "evidence shards" / floating document panels in teal-gold fog, crossed by a
// subtle rotating spotlight cone. Renders a visible first frame immediately,
// animates via requestAnimationFrame, resizes through a ResizeObserver, freezes
// flat under prefers-reduced-motion, and disposes everything on unmount.

interface Shard {
  baseX: number;   // 0..1 of width
  baseY: number;   // 0..1 of height
  ampX: number;
  ampY: number;
  w: number;       // px panel width
  h: number;       // px panel height
  speed: number;
  phase: number;
  rot: number;     // base rotation (rad)
  rotAmp: number;
  tone: number;    // 0 teal .. 1 gold
  alpha: number;
}

// Deterministic shard layout so the first frame is always composed.
const SHARDS: Shard[] = [
  { baseX: 0.16, baseY: 0.30, ampX: 0.018, ampY: 0.026, w: 132, h: 92, speed: 0.16, phase: 0.0, rot: -0.18, rotAmp: 0.05, tone: 0.0, alpha: 0.30 },
  { baseX: 0.78, baseY: 0.24, ampX: 0.022, ampY: 0.020, w: 156, h: 104, speed: 0.13, phase: 1.4, rot: 0.12, rotAmp: 0.06, tone: 0.85, alpha: 0.26 },
  { baseX: 0.62, baseY: 0.62, ampX: 0.020, ampY: 0.028, w: 188, h: 120, speed: 0.10, phase: 2.7, rot: -0.08, rotAmp: 0.04, tone: 0.2, alpha: 0.32 },
  { baseX: 0.30, baseY: 0.74, ampX: 0.026, ampY: 0.018, w: 120, h: 80, speed: 0.19, phase: 3.9, rot: 0.22, rotAmp: 0.07, tone: 0.5, alpha: 0.24 },
  { baseX: 0.88, baseY: 0.72, ampX: 0.016, ampY: 0.022, w: 100, h: 72, speed: 0.22, phase: 5.0, rot: -0.3, rotAmp: 0.05, tone: 1.0, alpha: 0.22 },
  { baseX: 0.44, baseY: 0.18, ampX: 0.024, ampY: 0.020, w: 110, h: 74, speed: 0.15, phase: 0.8, rot: 0.05, rotAmp: 0.05, tone: 0.1, alpha: 0.20 },
];

// teal -> gold mix as an rgb tuple.
function tone(t: number): [number, number, number] {
  const teal = [45, 212, 191];
  const gold = [245, 196, 81];
  return [
    Math.round(teal[0] + (gold[0] - teal[0]) * t),
    Math.round(teal[1] + (gold[1] - teal[1]) * t),
    Math.round(teal[2] + (gold[2] - teal[2]) * t),
  ];
}

export function LineupField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let raf = 0;

    function resize() {
      const parent = canvas!.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: 1440, height: 760 };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = width + "px";
      canvas!.style.height = height + "px";
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function roundRect(x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2);
      ctx!.beginPath();
      ctx!.moveTo(x + rr, y);
      ctx!.arcTo(x + w, y, x + w, y + h, rr);
      ctx!.arcTo(x + w, y + h, x, y + h, rr);
      ctx!.arcTo(x, y + h, x, y, rr);
      ctx!.arcTo(x, y, x + w, y, rr);
      ctx!.closePath();
    }

    function draw(t: number) {
      const time = t * 0.001;

      // Deep ink base wash.
      ctx!.globalCompositeOperation = "source-over";
      const base = ctx!.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, "#0c1014");
      base.addColorStop(1, "#070a0d");
      ctx!.fillStyle = base;
      ctx!.fillRect(0, 0, width, height);

      // Teal-gold fog pools (additive).
      ctx!.globalCompositeOperation = "lighter";
      const fog = [
        { x: 0.24, y: 0.22, c: "45, 212, 191", r: 0.62, a: 0.14 },
        { x: 0.82, y: 0.34, c: "245, 196, 81", r: 0.5, a: 0.09 },
        { x: 0.58, y: 0.82, c: "45, 212, 191", r: 0.56, a: 0.10 },
      ];
      for (const f of fog) {
        const cx = (f.x + Math.cos(time * 0.12 + f.x * 6) * 0.02) * width;
        const cy = (f.y + Math.sin(time * 0.1 + f.y * 6) * 0.02) * height;
        const r = f.r * Math.min(width, height);
        const g = ctx!.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${f.c}, ${f.a})`);
        g.addColorStop(0.5, `rgba(${f.c}, ${f.a * 0.35})`);
        g.addColorStop(1, `rgba(${f.c}, 0)`);
        ctx!.fillStyle = g;
        ctx!.beginPath();
        ctx!.arc(cx, cy, r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // Drifting evidence shards / document panels.
      for (const s of SHARDS) {
        const cx = (s.baseX + Math.cos(time * s.speed + s.phase) * s.ampX) * width;
        const cy = (s.baseY + Math.sin(time * s.speed * 1.15 + s.phase) * s.ampY) * height;
        const rot = s.rot + Math.sin(time * s.speed * 0.8 + s.phase) * s.rotAmp;
        const [r, g, b] = tone(s.tone);

        ctx!.save();
        ctx!.translate(cx, cy);
        ctx!.rotate(rot);

        // panel body — soft glassy fill
        ctx!.globalCompositeOperation = "lighter";
        roundRect(-s.w / 2, -s.h / 2, s.w, s.h, 10);
        const pg = ctx!.createLinearGradient(-s.w / 2, -s.h / 2, s.w / 2, s.h / 2);
        pg.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${s.alpha * 0.5})`);
        pg.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${s.alpha * 0.08})`);
        ctx!.fillStyle = pg;
        ctx!.fill();

        // panel edge
        ctx!.lineWidth = 1;
        ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${s.alpha + 0.12})`;
        ctx!.stroke();

        // faux evidence lines on the panel
        ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${s.alpha * 0.6})`;
        ctx!.lineWidth = 1;
        const pad = 14;
        const rows = 3;
        const gap = (s.h - pad * 2) / rows;
        for (let i = 0; i < rows; i++) {
          const ly = -s.h / 2 + pad + gap * i + 4;
          const lw = (s.w - pad * 2) * (i === rows - 1 ? 0.55 : 0.85);
          ctx!.beginPath();
          ctx!.moveTo(-s.w / 2 + pad, ly);
          ctx!.lineTo(-s.w / 2 + pad + lw, ly);
          ctx!.stroke();
        }
        ctx!.restore();
      }

      // Subtle rotating spotlight cone from top.
      ctx!.globalCompositeOperation = "lighter";
      const sweep = Math.sin(time * 0.08) * 0.16;
      const apexX = width * (0.5 + sweep);
      const apexY = -height * 0.12;
      const spread = width * 0.22;
      const floorY = height * 1.05;
      ctx!.save();
      ctx!.beginPath();
      ctx!.moveTo(apexX, apexY);
      ctx!.lineTo(apexX - spread, floorY);
      ctx!.lineTo(apexX + spread, floorY);
      ctx!.closePath();
      const cone = ctx!.createLinearGradient(apexX, apexY, apexX, floorY);
      cone.addColorStop(0, "rgba(245, 196, 81, 0.10)");
      cone.addColorStop(0.5, "rgba(45, 212, 191, 0.05)");
      cone.addColorStop(1, "rgba(45, 212, 191, 0)");
      ctx!.fillStyle = cone;
      ctx!.fill();
      ctx!.restore();

      // Vignette to seat content.
      ctx!.globalCompositeOperation = "source-over";
      const vg = ctx!.createRadialGradient(
        width / 2, height * 0.42, Math.min(width, height) * 0.2,
        width / 2, height * 0.5, Math.max(width, height) * 0.75,
      );
      vg.addColorStop(0, "rgba(7, 10, 13, 0)");
      vg.addColorStop(1, "rgba(7, 10, 13, 0.55)");
      ctx!.fillStyle = vg;
      ctx!.fillRect(0, 0, width, height);
    }

    resize();
    draw(0); // visible first frame

    if (!reduced) {
      const loop = (t: number) => {
        draw(t);
        raf = window.requestAnimationFrame(loop);
      };
      raf = window.requestAnimationFrame(loop);
    }

    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        resize();
        if (reduced) draw(0);
      });
      if (canvas.parentElement) ro.observe(canvas.parentElement);
    }

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
