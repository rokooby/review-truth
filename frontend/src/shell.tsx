import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import Zdog from "zdog";

// ----------------------------------------------------------------------------
//: design (clair technique, bordures nettes,
// accents mono, indigo/noir) + skeleton 'timeline-vertical' (lifecycle en
// timeline verticale a gauche, contenu a droite) + moteur 'zdog' (rendu 3D
// plat en accent/hero). Vocabulaire : resolution / entry / decide.
// Ce fichier est partage a l'identique entre toutes les apps du contributeur.
// ----------------------------------------------------------------------------

export type Tone = "good" | "mid" | "bad" | "";
export type NodeState = "done" | "active" | "idle" | "locked";

export interface StepView {
  num: number;
  verb: string; // exact contract method name (mono badge)
  title: string;
  blurb: string;
  body: ReactNode;
}

export interface RecordField {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}

export interface MeasureView {
  label: string;
  value: number;
  unit?: string;
  max?: number;
}

export interface RecordView {
  id: number;
  status: number;
  statusLabels: string[];
  fields: RecordField[];
  verdictLabel: string;
  verdict: string;
  verdictTone: Tone;
  measure: MeasureView | null;
  rationale?: string;
}

export interface StatBlock {
  label: string;
  value: string;
}

// One row of the auto-listed registre/feed (no manual id lookup).
export interface FeedItem {
  id: number;
  verdict: string;
  verdictTone: Tone;
  measure: string;
  extract: string;
  active: boolean;
}

export interface ShellProps {
  brand: string;
  vocab: string;
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  stats: StatBlock[];
  steps: StepView[];
  nodeStates: NodeState[];
  selected: number;
  onSelect: (i: number) => void;
  record: RecordView | null;
  feed: FeedItem[];
  onPick: (id: number) => void;
  refreshing: boolean;
  onRefresh: () => void;
  busy: string | null;
  note: string;
  contractAddress: string;
}

// ---- zdog flat-3D hero : a stacked, slowly turning lifecycle "stack" --------
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function ZdogHero() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const illo = new Zdog.Illustration({ element: el, zoom: 3.4 } as Record<string, unknown>);
    illo.rotate.x = -0.62;
    illo.rotate.z = -0.78;

    const stack = new Zdog.Anchor({ addTo: illo } as Record<string, unknown>);
    const base = "#5b4ee6";
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
      const col = i === tiers - 1 ? "#0b0b0e" : shade(base, (i - 1) * 22);
      new Zdog.Box({
        addTo: stack,
        width: 44 - i * 4,
        height: 44 - i * 4,
        depth: 11,
        translate: { z: i * 13 - 19 },
        color: col,
        stroke: false,
        leftFace: shade(col, -26),
        rightFace: shade(col, -14),
        topFace: shade(col, 30),
      } as Record<string, unknown>);
    }
    // an orbiting indigo marker = the "decide" node travelling the lifecycle
    const orbit = new Zdog.Anchor({ addTo: illo } as Record<string, unknown>);
    new Zdog.Shape({
      addTo: orbit,
      stroke: 9,
      translate: { x: 34, z: 6 },
      color: "#f0a020",
    } as Record<string, unknown>);

    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.01;
      stack.rotate.z = t;
      orbit.rotate.z = -t * 1.7;
      illo.updateRenderGraph();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={360} height={300} className="zdog-hero" aria-hidden="true" />;
}

function MarkLogo() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const illo = new Zdog.Illustration({ element: el, zoom: 2.1 } as Record<string, unknown>);
    illo.rotate.x = -0.6;
    illo.rotate.z = -0.78;
    new Zdog.Box({
      addTo: illo,
      width: 11,
      height: 11,
      depth: 11,
      color: "#5b4ee6",
      stroke: false,
      leftFace: "#3f33b8",
      rightFace: "#4a3dd0",
      topFace: "#7c6df0",
    } as Record<string, unknown>);
    let raf = 0;
    let t = 0;
    const tick = () => {
      t += 0.012;
      illo.rotate.z = -0.78 + Math.sin(t) * 0.5;
      illo.updateRenderGraph();
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={34} height={34} className="mark-canvas" aria-hidden="true" />;
}

export function Shell(p: ShellProps) {
  const short = `${p.contractAddress.slice(0, 6)}...${p.contractAddress.slice(-4)}`;
  const sel = p.steps[p.selected];
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <MarkLogo />
          <span className="bname">{p.brand}</span>
          <code className="vocab">{p.vocab}</code>
        </div>
        <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="kicker">{p.kicker}</div>
          <h1>{p.title}</h1>
          <p className="lede">{p.lede}</p>
          <div className="stats">
            {p.stats.map((s, i) => (
              <div className="stat" key={i}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="hero-art">
          <ZdogHero />
        </div>
      </section>

      <section className="board">
        <aside className="timeline">
          <div className="tl-head">lifecycle</div>
          <ol className="tl-list">
            {p.steps.map((s, i) => {
              const st = p.nodeStates[i] || "idle";
              return (
                <li
                  key={s.num}
                  className={`tl-step ${st} ${i === p.selected ? "sel" : ""}`}
                  onClick={() => p.onSelect(i)}
                >
                  <span className="tl-node">{st === "done" ? "\u2713" : s.num}</span>
                  <span className="tl-text">
                    <span className="tl-title">{s.title}</span>
                    <code className="tl-verb">{s.verb}</code>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="stage">
          <div className="stage-head">
            <span className="stage-num">{String(sel.num).padStart(2, "0")}</span>
            <div>
              <h2>{sel.title}</h2>
              <p>{sel.blurb}</p>
            </div>
            <code className="stage-verb">{sel.verb}</code>
          </div>
          <div className="stage-body">{sel.body}</div>
        </div>
      </section>

      <section className="ledger">
        <div className="ledger-head">
          <h3>entry registre</h3>
          <button className="btn-ghost" disabled={p.refreshing} onClick={p.onRefresh}>
            {p.refreshing ? "refreshing..." : "refresh"}
          </button>
        </div>

        {p.feed.length > 0 ? (
          <ul className="feed">
            {p.feed.map((it) => (
              <li
                key={it.id}
                className={`feed-row ${it.active ? "sel" : ""}`}
                onClick={() => p.onPick(it.id)}
              >
                <span className="feed-id">#{it.id}</span>
                <span className={`feed-verdict tone-${it.verdictTone || "none"}`}>
                  {it.verdict ? it.verdict.replace(/_/g, " ") : "pending"}
                </span>
                <span className="feed-measure">{it.measure}</span>
                <span className="feed-extract">{it.extract || "\u2014"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">No entries yet. Run a stage above to create the first one.</p>
        )}

        {p.record ? (
          <div className="rec">
            <div className="rec-top">
              <span className="rec-id">entry #{p.record.id}</span>
              <span className={`pill s${p.record.status}`}>
                {p.record.statusLabels[p.record.status] || p.record.status}
              </span>
            </div>

            <div className="rec-grid">
              {p.record.fields.map((f, i) => (
                <div className={`field ${f.wide ? "wide" : ""}`} key={i}>
                  <label>{f.label}</label>
                  <div className={f.mono ? "fv mono" : "fv"}>{f.value || "\u2014"}</div>
                </div>
              ))}
            </div>

            <div className="resolution">
              <div className="res-left">
                <span className="res-label">{p.record.verdictLabel}</span>
                <span className={`res-value tone-${p.record.verdictTone || "none"}`}>
                  {p.record.verdict ? p.record.verdict.replace(/_/g, " ") : "pending"}
                </span>
              </div>
              {p.record.measure && (
                <div className="measure">
                  <div className="m-row">
                    <span>{p.record.measure.label}</span>
                    <b>
                      {p.record.measure.value}
                      {p.record.measure.unit ? ` ${p.record.measure.unit}` : ""}
                    </b>
                  </div>
                  {p.record.measure.max ? (
                    <div className="m-bar">
                      <i
                        className={`tone-${p.record.verdictTone || "none"}`}
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, (p.record.measure.value / p.record.measure.max) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {p.record.rationale ? <p className="rationale">{p.record.rationale}</p> : null}
          </div>
        ) : (
          <p className="empty">Select an entry from the registre above to see the full record and act on it.</p>
        )}
      </section>

      {(p.busy || p.note) && <div className="toast">{p.busy ? `${p.busy}...` : p.note}</div>}

      <footer className="foot">
        <span className="f-brand">{p.brand}</span>
        <span>
          contract <code>{short}</code>
        </span>
        <span>resolved by independent GenLayer validators on studionet</span>
      </footer>
    </div>
  );
}
