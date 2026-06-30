import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import {
  Scales,
  Stack,
  Gavel,
  Coins,
  SealCheck,
  Flag,
  FileArrowUp,
  PlusCircle,
  CaretRight,
  ArrowClockwise,
  WarningCircle,
  Storefront,
  Fingerprint,
  X,
  Hourglass,
  Trophy,
  Medal,
  Spinner,
} from "@phosphor-icons/react";
import {
  openRound, submitBatch, flagBatch, closeAndJudge, settleRound, scoreBatch, disputeRuling,
  getRound, getRoundBatches, getRoundFlags, getCounts, listRounds,
  ROUND_OPEN, ROUND_RULED, ROUND_SETTLED, ROUND_STATUS, BATCH_STATUS, FLAG_WON, FLAG_LOST,
  RoundView, RoundRow, BatchRow, FlagRow, Counts,
} from "./contractService";
import { CONTRACT_ADDRESS } from "./chain";
import { LineupField } from "./LineupField";
import { Modal } from "./Modal";

type Hex = `0x${string}`;

function shortAddr(a: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "anonymous";
}
async function copyText(t: string) { try { await navigator.clipboard.writeText(t); } catch { /* clipboard blocked */ } }

function gen(wei: string): string {
  if (!wei || wei === "0") return "0";
  try {
    const v = formatEther(BigInt(wei));
    const n = Number(v);
    return Number.isFinite(n) ? (Math.round(n * 1000) / 1000).toString() : v;
  } catch { return "0"; }
}

function prefersReduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// requestAnimationFrame number interpolation for the hero stat strip.
function useCountUp(target: number, duration = 850): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (prefersReduced()) { fromRef.current = target; setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const from = fromRef.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function StatValue({ target, suffix = "" }: { target: number; suffix?: string }) {
  const v = useCountUp(target);
  const shown = Number.isInteger(target) ? Math.round(v) : Math.round(v * 1000) / 1000;
  return <span className="stat__val">{shown}{suffix}</span>;
}

// Bespoke Trueview mark: two overlapping document panels (a comparator), the
// front stamped with a magnifier/eye, a gold spotlight notch, teal -> gold.
function TrueviewMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="tv-grad" x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#f5c451" />
        </linearGradient>
      </defs>
      {/* back panel */}
      <rect x="13" y="6" width="20" height="25" rx="3" fill="url(#tv-grad)" opacity="0.32" />
      {/* front panel */}
      <rect x="7" y="10" width="20" height="25" rx="3" fill="url(#tv-grad)" />
      {/* spotlight notch (gold) */}
      <path d="M27 10 l6 3 -6 3 z" fill="#f5c451" />
      {/* magnifier / eye stamped on front */}
      <circle cx="17" cy="21" r="5.4" fill="none" stroke="#06231f" strokeWidth="2" />
      <circle cx="17" cy="21" r="1.8" fill="#06231f" />
      <line x1="21" y1="25" x2="24.5" y2="28.5" stroke="#06231f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function roundChipClass(status: number): string {
  if (status === ROUND_SETTLED) return "chip--settled";
  if (status === ROUND_RULED) return "chip--ruled";
  return "chip--open";
}

export function App() {
  const { address, isConnected } = useAccount();
  const acct = address as Hex | undefined;

  // forms
  const [category, setCategory] = useState("");
  const [business, setBusiness] = useState("");
  const [evidence, setEvidence] = useState("");
  const [bond, setBond] = useState("1");
  const [flagStake, setFlagStake] = useState("1");
  const [disputeStake, setDisputeStake] = useState("1");
  const [openForm, setOpenForm] = useState<null | "round" | "batch">(null);

  // data
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ nextRound: 0, nextBatch: 0, nextFlag: 0, ruled: 0, fraudulent: 0, pool: "0" });
  const [selId, setSelId] = useState<number | null>(null);
  const [sel, setSel] = useState<RoundView | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [selBatch, setSelBatch] = useState<number | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [netErr, setNetErr] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadDetail(id: number) {
    try {
      const [r, b, f] = await Promise.all([getRound(id), getRoundBatches(id), getRoundFlags(id)]);
      setSel(r); setBatches(b); setFlags(f);
    } catch { /* keep last */ }
  }

  async function refreshAll() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const [c, list] = await Promise.all([getCounts(), listRounds(60)]);
      setCounts(c); setRounds(list);
      if (selId != null) await loadDetail(selId);
      setNetErr(false);
    } catch { setNetErr(true); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    refreshAll();
    const t = setInterval(refreshAll, 12000);
    const onVis = () => { if (!document.hidden) refreshAll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pickRound(id: number) {
    setSelId(id);
    setSelBatch(null);
    setOpenForm(null);
    await loadDetail(id);
    scrollToStage();
  }

  function scrollToStage() {
    const el = document.getElementById("stage");
    if (el) el.scrollIntoView({ behavior: prefersReduced() ? "auto" : "smooth", block: "start" });
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label); setNote("");
    try { return await fn(); }
    catch (e) { setNote(String((e as Error).message || e).slice(0, 240)); return undefined; }
    finally { setBusy(null); refreshAll(); }
  }

  async function onOpenRound() {
    if (!acct) return setNote("Connect a wallet to open a round.");
    if (category.trim().length < 2) return setNote("Category is required.");
    const id = await run("Opening the round", () => openRound(acct, category));
    if (id != null) { setSelId(id); setCategory(""); setOpenForm(null); setSelBatch(null); await loadDetail(id); }
  }

  async function onSubmitBatch() {
    if (!acct) return setNote("Connect a wallet to enter the cohort.");
    if (selId == null) return setNote("Select an open round first.");
    if (business.trim().length < 2) return setNote("Business name is required.");
    if (evidence.trim().length < 30) return setNote("Review evidence must be at least 30 characters.");
    if (!(Number(bond) > 0)) return setNote("Authenticity bond must be greater than 0 GEN.");
    const id = await run("Posting bond, entering the cohort", () => submitBatch(acct, selId, business, evidence, parseEther(bond.trim())));
    if (id != null) { setBusiness(""); setEvidence(""); setOpenForm(null); await loadDetail(selId); }
  }

  async function onFlag(batchId: number) {
    if (!acct) return setNote("Connect a wallet to stake a flag.");
    if (!(Number(flagStake) > 0)) return setNote("Flag stake must be greater than 0 GEN.");
    await run(`Staking a flag on batch #${batchId}`, () => flagBatch(acct, batchId, parseEther(flagStake.trim())));
  }

  async function onJudge() { if (!acct || selId == null) return; await run("Validators judging the cohort", () => closeAndJudge(acct, selId)); }
  async function onSettle() { if (!acct || selId == null) return; await run("Settling the round", () => settleRound(acct, selId)); }
  async function onScore(bid: number) { if (!acct) return; await run(`Re-scoring batch #${bid}`, () => scoreBatch(acct, bid)); }
  async function onDispute() {
    if (!acct || selId == null) return;
    if (!(Number(disputeStake) > 0)) return setNote("Dispute stake must be greater than 0 GEN.");
    await run("Filing the dispute", () => disputeRuling(acct, selId, parseEther(disputeStake.trim())));
  }

  // ---- derived ----
  const flagByBatch = useMemo(() => {
    const m = new Map<number, bigint>();
    for (const f of flags) m.set(f.batchId, (m.get(f.batchId) ?? 0n) + BigInt(f.stake || "0"));
    return m;
  }, [flags]);
  const totalFlag = useMemo(() => flags.reduce((a, f) => a + BigInt(f.stake || "0"), 0n), [flags]);

  function flagPct(batchId: number): number {
    const s = flagByBatch.get(batchId) ?? 0n;
    return totalFlag > 0n ? Number((s * 10000n) / totalFlag) / 100 : 0;
  }

  // Flag leaderboard for the selected round, derived from getRoundFlags: the
  // heaviest flaggers by total stake. Honest to the available data.
  const leaderboard = useMemo(() => {
    const m = new Map<string, { stake: bigint; won: bigint; count: number; lost: number }>();
    for (const f of flags) {
      const key = f.flagger;
      const cur = m.get(key) ?? { stake: 0n, won: 0n, count: 0, lost: 0 };
      cur.stake += BigInt(f.stake || "0");
      cur.count += 1;
      if (f.status === FLAG_WON) cur.won += BigInt(f.payout || "0");
      if (f.status === FLAG_LOST) cur.lost += 1;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([flagger, v]) => ({ flagger, ...v }))
      .sort((a, b) => (b.stake > a.stake ? 1 : b.stake < a.stake ? -1 : 0))
      .slice(0, 5);
  }, [flags]);

  const stats = useMemo(
    () => [
      { icon: <Stack size={18} weight="duotone" />, cap: "Rounds", target: counts.nextRound, suffix: "" },
      { icon: <Gavel size={18} weight="duotone" />, cap: "Cohorts judged", target: counts.ruled, suffix: "" },
      { icon: <Scales size={18} weight="duotone" />, cap: "Batches slashed", target: counts.fraudulent, suffix: "" },
      { icon: <Coins size={18} weight="duotone" />, cap: "Prize pool", target: Number(gen(counts.pool)), suffix: " GEN" },
    ],
    [counts],
  );

  const selBatchRow = useMemo(() => batches.find((b) => b.id === selBatch) ?? null, [batches, selBatch]);
  const isWorstSeller = !!sel && !!acct && sel.hasWorst && !!selBatchRow &&
    selBatchRow.seller.toLowerCase() === acct.toLowerCase();

  function batchStatusChip(b: BatchRow) {
    if (!sel) return { cls: "chip--entered", label: "ENTERED" };
    if (sel.hasWorst && b.id === sel.worstBatchId) return { cls: "chip--worst", label: "WORST" };
    if (sel.hasWorst && b.id === sel.cleanestBatchId) return { cls: "chip--clean", label: "CLEANEST" };
    if ((flagByBatch.get(b.id) ?? 0n) > 0n) return { cls: "chip--flagged", label: "FLAGGED" };
    return { cls: "chip--entered", label: BATCH_STATUS[b.status] || "ENTERED" };
  }

  const roundResolved = !!sel && (sel.status === ROUND_RULED || sel.status === ROUND_SETTLED);
  const worstBatch = useMemo(
    () => (sel?.hasWorst ? batches.find((b) => b.id === sel.worstBatchId) ?? null : null),
    [sel, batches],
  );
  const cleanestBatch = useMemo(
    () => (sel?.hasWorst ? batches.find((b) => b.id === sel.cleanestBatchId) ?? null : null),
    [sel, batches],
  );

  // Past rounds that already carry a verdict — the precedent record.
  const precedent = useMemo(
    () => rounds.filter((r) => r.hasWorst && (r.status === ROUND_RULED || r.status === ROUND_SETTLED)),
    [rounds],
  );

  function openRoundForm() {
    setOpenForm("round");
    setSelBatch(null);
  }
  function openBatchForm() {
    if (selId == null || sel?.status !== ROUND_OPEN) return;
    setOpenForm("batch");
    setSelBatch(null);
  }

  function onKeyActivate(e: React.KeyboardEvent, fn: () => void) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  }

  return (
    <div className="page">
      <header className="nav">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true"><TrueviewMark size={28} /></span>
          <span className="brand__name">Trueview</span>
          <span className="brand__sep">/</span>
          <span className="brand__sub">the review tribunal</span>
        </div>
        <div className="nav__right">
          <span className={`pulse ${netErr ? "off" : ""}`}>
            <i /> {netErr ? "reconnecting" : "studionet live"}
          </span>
          <ConnectButton showBalance={false} chainStatus="none" accountStatus="address" />
        </div>
      </header>

      <section className="hero">
        <div className="hero__bg">
          <LineupField className="hero__canvas" />
        </div>
        <div className="hero__inner">
          <span className="kicker">
            <SealCheck size={15} weight="fill" /> Comparative review-fraud tribunal
          </span>
          <h1 className="hero__title">
            Bring the cohort
            <br />
            before <span className="accent">the bench</span>.
          </h1>
          <p className="hero__lead">
            A curator opens a round. Competing businesses post a GEN bond to enter the cohort with their review
            batch. Anyone stakes GEN to flag the worst offender. When the round closes, GenLayer validators read
            the whole lineup and agree on one fraudulent batch and the cleanest one. Flaggers on the worst split
            the slash.
          </p>
          <div className="hero__cta">
            <button className="btn btn--primary" onClick={openRoundForm}>
              <PlusCircle size={18} weight="bold" /> Open a round
            </button>
            <a className="btn btn--ghost" href="#stage">
              Enter the courtroom <CaretRight size={16} weight="bold" />
            </a>
          </div>
          <div className="stats">
            {stats.map((s) => (
              <div className="stat" key={s.cap}>
                <span className="stat__icon">{s.icon}</span>
                <StatValue target={s.target} suffix={s.suffix} />
                <span className="stat__cap">{s.cap}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="court">
        {netErr && (
          <div className="banner">
            <WarningCircle size={18} weight="fill" /> Network trouble reaching studionet. Retrying...
          </div>
        )}

        {/* ---- docket: the cases on the roll ---- */}
        <div className="docket">
          <div className="docket__label">
            <Gavel size={15} weight="fill" /> Docket
          </div>
          <div className="docket__roll" role="tablist" aria-label="Rounds on the docket">
            {rounds.length === 0 ? (
              <span className="docket__empty">No rounds opened yet — open the first comparative round.</span>
            ) : (
              rounds.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  className={`docket__case ${selId === r.id ? "is-sel" : ""}`}
                  aria-selected={selId === r.id}
                  aria-label={`Round ${r.id}, ${r.category || "untitled"}, ${ROUND_STATUS[r.status]}, ${r.batchCount} in cohort`}
                  onClick={() => pickRound(r.id)}
                >
                  <span className="docket__no">case/{String(r.id).padStart(4, "0")}</span>
                  <span className="docket__cat">{r.category || "untitled round"}</span>
                  <span className="docket__meta">
                    <span className={`chip ${roundChipClass(r.status)}`}>{ROUND_STATUS[r.status]}</span>
                    <span className="docket__count">{r.batchCount} in cohort</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <button className="btn btn--primary docket__open" onClick={openRoundForm}>
            <PlusCircle size={18} weight="bold" /> Open a round
          </button>
        </div>

        {/* ---- verdict stage ---- */}
        <section id="stage" className="stage" aria-label="Verdict stage">
          {loading && selId == null ? (
            <div className="stage__empty">
              <Spinner size={34} weight="bold" className="spin" />
              <p className="muted">Loading the docket...</p>
            </div>
          ) : selId == null || !sel ? (
            <div className="stage__empty">
              <span className="stage__emptyIcon"><Scales size={46} weight="duotone" /></span>
              <h2>No case on the stand</h2>
              <p>Pick a case from the docket above, or open a new round to convene a comparative tribunal.</p>
              <button className="btn btn--primary" onClick={openRoundForm}>
                <PlusCircle size={16} weight="bold" /> Open a round
              </button>
            </div>
          ) : roundResolved && sel.hasWorst ? (
            // ---- the ruling: worst spotlit center, cleanest beside ----
            <div className="verdict">
              <div className="verdict__head">
                <div>
                  <span className="verdict__case">case/{String(selId).padStart(4, "0")}</span>
                  <h2 className="verdict__cat">{sel.category || "untitled round"}</h2>
                </div>
                <div className="verdict__headmeta">
                  <span className={`chip ${roundChipClass(sel.status)}`}>{ROUND_STATUS[sel.status]}</span>
                  {sel.disputed && <span className="chip chip--disputed">DISPUTED</span>}
                </div>
              </div>

              <div className="podiums">
                {/* WORST — spotlit, slashed */}
                <article className="podium podium--worst">
                  <span className="podium__beam" aria-hidden="true" />
                  <div className="podium__role">
                    <Scales size={15} weight="fill" /> Ruled fraudulent
                  </div>
                  <span className="seal seal--worst seal--big"><Scales size={14} weight="fill" /> SLASHED</span>
                  <div className="podium__plate" aria-hidden="true">NO. {worstBatch ? String(worstBatch.id).padStart(2, "0") : String(sel.worstBatchId).padStart(2, "0")}</div>
                  <h3 className="podium__biz">{worstBatch?.business || `batch #${sel.worstBatchId}`}</h3>
                  <div className="podium__stats">
                    <div><span>Worst suspect</span><b className="worst">{sel.worstSuspectPct}%</b></div>
                    <div><span>Confidence</span><b>{sel.confidence}%</b></div>
                    {worstBatch && <div><span>Bond slashed</span><b className="worst">{gen(worstBatch.bond)} GEN</b></div>}
                  </div>
                  {worstBatch && (
                    <button className="btn btn--ghost full" onClick={() => { setSelBatch(worstBatch.id); }}>
                      <Fingerprint size={16} weight="fill" /> Open dossier
                    </button>
                  )}
                </article>

                {/* CLEANEST — laurel */}
                <article className="podium podium--clean">
                  <div className="podium__role">
                    <Medal size={15} weight="fill" /> Cleanest batch
                  </div>
                  <span className="seal seal--clean seal--big"><SealCheck size={14} weight="fill" /> LAUREL</span>
                  <div className="podium__plate podium__plate--clean" aria-hidden="true">NO. {cleanestBatch ? String(cleanestBatch.id).padStart(2, "0") : String(sel.cleanestBatchId).padStart(2, "0")}</div>
                  <h3 className="podium__biz">{cleanestBatch?.business || `batch #${sel.cleanestBatchId}`}</h3>
                  <div className="podium__stats">
                    {cleanestBatch && <div><span>Suspect</span><b style={{ color: "var(--clean)" }}>{cleanestBatch.suspectPct}%</b></div>}
                    {cleanestBatch && <div><span>Bond</span><b>{gen(cleanestBatch.bond)} GEN</b></div>}
                  </div>
                  {cleanestBatch && (
                    <button className="btn btn--ghost full" onClick={() => { setSelBatch(cleanestBatch.id); }}>
                      <Fingerprint size={16} weight="fill" /> Open dossier
                    </button>
                  )}
                </article>
              </div>

              {/* ruling ledger + actions */}
              <div className="verdict__ledger">
                <div className="vl__facts">
                  <div><span>Curator</span><b>{shortAddr(sel.curator)}</b></div>
                  <div><span>Cohort</span><b>{sel.batchCount}</b></div>
                  <div><span>Pool</span><b className="gold">{gen(counts.pool)} GEN</b></div>
                  {sel.status === ROUND_SETTLED && (
                    <>
                      <div><span>Slashed</span><b className="worst">{gen(sel.slashedWei)} GEN</b></div>
                      <div><span>Distributed</span><b className="gold">{gen(sel.distributedWei)} GEN</b></div>
                    </>
                  )}
                </div>

                {sel.reasoning && (
                  <div className="block block--rationale">
                    <span className="block__cap">Tribunal reasoning</span>
                    <p>{sel.reasoning}</p>
                  </div>
                )}

                <div className="verdict__actions">
                  {sel.status === ROUND_RULED && (
                    <button className="btn btn--primary" disabled={!isConnected || !!busy} onClick={onSettle}>
                      <Coins size={18} weight="bold" /> Settle the round
                    </button>
                  )}
                  {sel.status === ROUND_RULED && !sel.disputed && (
                    <button className="btn btn--ghost" disabled={!isConnected || !!busy || !isWorstSeller} onClick={() => setSelBatch(sel.worstBatchId)}>
                      <Scales size={18} weight="bold" /> Dispute the ruling
                    </button>
                  )}
                  {sel.status === ROUND_SETTLED && (
                    <span className="muted">
                      <SealCheck size={16} weight="fill" /> Settled. Slashed {gen(sel.slashedWei)} GEN, distributed {gen(sel.distributedWei)} GEN.
                    </span>
                  )}
                </div>
                {sel.status === ROUND_RULED && !sel.disputed && !isWorstSeller && (
                  <p className="hint">Only the seller of the worst-ruled batch can stake to dispute. Open its dossier to file.</p>
                )}
              </div>
            </div>
          ) : (
            // ---- open round: awaiting verdict ----
            <div className="awaiting">
              <div className="awaiting__head">
                <div>
                  <span className="verdict__case">case/{String(selId).padStart(4, "0")}</span>
                  <h2 className="verdict__cat">{sel.category || "untitled round"}</h2>
                </div>
                <span className={`chip ${roundChipClass(sel.status)}`}>{ROUND_STATUS[sel.status]}</span>
              </div>

              <div className="awaiting__body">
                <div className="awaiting__beacon" aria-hidden="true">
                  <Hourglass size={40} weight="duotone" className={prefersReduced() ? "" : "sway"} />
                </div>
                <div className="awaiting__copy">
                  <h3>Awaiting verdict</h3>
                  <p>
                    {sel.batchCount < 2
                      ? "The cohort needs at least two batches before the tribunal can compare them. Enter a batch to fill the lineup."
                      : "The lineup is assembled. Close the round to send the whole cohort to the GenLayer validators for a comparative ruling."}
                  </p>
                </div>
                <div className="awaiting__facts">
                  <div><span>Curator</span><b>{shortAddr(sel.curator)}</b></div>
                  <div><span>Cohort</span><b>{sel.batchCount}</b></div>
                  <div><span>Prize pool</span><b className="gold">{gen(counts.pool)} GEN</b></div>
                  <div><span>Flag stake</span><b className="gold">{gen(totalFlag.toString())} GEN</b></div>
                </div>
              </div>

              <div className="awaiting__actions">
                <button className="btn btn--primary" disabled={!isConnected || !!busy || sel.batchCount < 2} onClick={onJudge}>
                  <Gavel size={18} weight="bold" /> Close &amp; judge
                </button>
                <button className="btn btn--ghost" onClick={openBatchForm}>
                  <FileArrowUp size={18} weight="bold" /> Enter cohort
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ---- horizontal cohort lineup ---- */}
        {selId != null && sel && (
          <section className="lineup-wrap" aria-label="Cohort lineup">
            <div className="lineup-wrap__head">
              <h2 className="court__title">The lineup</h2>
              <p className="court__sub">
                {batches.length === 0
                  ? "Empty cohort. Post a bond to enter the first batch."
                  : "Scroll the suspects. Select one to open its dossier below."}
              </p>
            </div>

            {batches.length === 0 ? (
              <div className="lineup-rail lineup-rail--empty">
                <div className="stage__empty stage__empty--inline">
                  <span className="stage__emptyIcon"><Storefront size={36} weight="duotone" /></span>
                  <h3>No batches yet</h3>
                  <p>No batches have entered this round. Post a bond to enter the first batch.</p>
                  <button className="btn btn--primary" disabled={sel.status !== ROUND_OPEN} onClick={openBatchForm}>
                    <FileArrowUp size={16} weight="bold" /> Enter cohort
                  </button>
                </div>
              </div>
            ) : (
              <div className="lineup-rail" role="list">
                {batches.map((b) => {
                  const chip = batchStatusChip(b);
                  const isWorst = !!sel.hasWorst && b.id === sel.worstBatchId;
                  const isClean = !!sel.hasWorst && b.id === sel.cleanestBatchId;
                  const stakeWei = flagByBatch.get(b.id) ?? 0n;
                  const pct = flagPct(b.id);
                  return (
                    <div
                      role="listitem"
                      key={b.id}
                      tabIndex={0}
                      className={`suspect ${selBatch === b.id ? "is-sel" : ""} ${isWorst ? "is-worst" : ""} ${isClean ? "is-clean" : ""} ${isWorst && roundResolved ? "spotlit" : ""}`}
                      aria-label={`Batch ${b.id}, ${b.business}, status ${chip.label}, flag weight ${pct.toFixed(0)} percent`}
                      onClick={() => { setSelBatch(selBatch === b.id ? null : b.id); }}
                      onKeyDown={(e) => onKeyActivate(e, () => setSelBatch(selBatch === b.id ? null : b.id))}
                    >
                      {isWorst && roundResolved && (
                        <span className="seal seal--worst"><Scales size={12} weight="fill" /> SLASHED</span>
                      )}
                      {isClean && roundResolved && (
                        <span className="seal seal--clean"><SealCheck size={12} weight="fill" /> CLEANEST</span>
                      )}
                      <div className="suspect__plate" aria-hidden="true">
                        <span className="suspect__plate-no">NO.</span>
                        <span className="suspect__plate-id">{String(b.id).padStart(2, "0")}</span>
                      </div>
                      <div className="suspect__main">
                        <div className="suspect__top">
                          <h3 className="suspect__biz">{b.business || `batch #${b.id}`}</h3>
                          <span className={`chip ${chip.cls}`}>{chip.label}</span>
                        </div>
                        <div className="suspect__grid">
                          <div className="suspect__cell">
                            <span>Bond</span>
                            <b>{gen(b.bond)} GEN</b>
                          </div>
                          <div className="suspect__cell">
                            <span>Flag stake</span>
                            <b className="gold">{gen(stakeWei.toString())} GEN</b>
                          </div>
                        </div>
                        <div className="meter">
                          <div className="meter__head">
                            <span className="meter__label">Flag weight</span>
                            <span className="meter__val">{pct.toFixed(1)}%</span>
                          </div>
                          <div className="meter__track">
                            <div className="meter__fill" style={{ width: `${Math.max(2, pct)}%` }} />
                          </div>
                        </div>
                        <div className="suspect__foot">
                          {b.verdict && <span className={`chip ${b.verdict === "FRAUDULENT" ? "chip--worst" : b.verdict === "AUTHENTIC" ? "chip--clean" : "chip--flagged"}`}>{b.verdict}</span>}
                          <span className="suspect__addr">seller {shortAddr(b.seller)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* ---- evidence drawer: full-width slide-down dossier ---- */}
        {selBatchRow && (
          <section className="dossier" aria-label={`Dossier for batch ${selBatchRow.id}`}>
            <div className="dossier__head">
              <span className="dossier__kick">
                <Fingerprint size={16} weight="fill" /> Dossier · batch #{String(selBatchRow.id).padStart(2, "0")}
              </span>
              <div className="dossier__headright">
                <span className={`chip ${batchStatusChip(selBatchRow).cls}`}>{batchStatusChip(selBatchRow).label}</span>
                <button type="button" className="dossier__close" onClick={() => setSelBatch(null)} aria-label="Close dossier">
                  <X size={18} weight="bold" />
                </button>
              </div>
            </div>

            <div className="dossier__body">
              <div className="dossier__left">
                <h3 className="detail__cite">{selBatchRow.business || `batch #${selBatchRow.id}`}</h3>
                <div className="detail__grid">
                  <div><span>Bond</span><b>{gen(selBatchRow.bond)} GEN</b></div>
                  <div><span>Flag stake</span><b className="gold">{gen((flagByBatch.get(selBatchRow.id) ?? 0n).toString())} GEN</b></div>
                  <div><span>Suspect</span><b className={selBatchRow.suspectPct >= 50 ? "worst" : ""}>{selBatchRow.suspectPct}%</b></div>
                  <div><span>Status</span><b>{BATCH_STATUS[selBatchRow.status]}</b></div>
                </div>
                <div className="detail__stage">
                  <span className="muted">seller {shortAddr(selBatchRow.seller)}</span>
                  {selBatchRow.verdict && <span className={`chip ${selBatchRow.verdict === "FRAUDULENT" ? "chip--worst" : selBatchRow.verdict === "AUTHENTIC" ? "chip--clean" : "chip--flagged"}`}>{selBatchRow.verdict}</span>}
                  {selBatchRow.refunded && <span className="chip chip--settled">SETTLED</span>}
                </div>

                {selBatchRow.evidence && (
                  <div className="block">
                    <span className="block__cap">Review batch</span>
                    <pre className="evidence">{selBatchRow.evidence}</pre>
                  </div>
                )}
              </div>

              <div className="dossier__right">
                {/* share-of-total flag distribution across the whole cohort */}
                {totalFlag > 0n && (
                  <div className="distrib">
                    <div className="distrib__cap">Flag stake distribution</div>
                    <div className="distrib__bar">
                      {batches.filter((b) => (flagByBatch.get(b.id) ?? 0n) > 0n).map((b) => {
                        const isWorst = sel?.hasWorst && b.id === sel.worstBatchId;
                        const isClean = sel?.hasWorst && b.id === sel.cleanestBatchId;
                        const color = isWorst ? "var(--worst)" : isClean ? "var(--clean)" : "var(--primary)";
                        return (
                          <span
                            key={b.id}
                            className="distrib__seg"
                            style={{ width: `${flagPct(b.id)}%`, background: color, outline: b.id === selBatchRow.id ? "2px solid var(--foreground)" : "none" }}
                            title={`batch #${b.id}: ${flagPct(b.id).toFixed(1)}%`}
                          />
                        );
                      })}
                    </div>
                    <div className="distrib__legend">
                      {batches.filter((b) => (flagByBatch.get(b.id) ?? 0n) > 0n).map((b) => {
                        const isWorst = sel?.hasWorst && b.id === sel.worstBatchId;
                        const isClean = sel?.hasWorst && b.id === sel.cleanestBatchId;
                        const color = isWorst ? "var(--worst)" : isClean ? "var(--clean)" : "var(--primary)";
                        return (
                          <span className="distrib__key" key={b.id}>
                            <span className="distrib__dot" style={{ background: color }} /> #{b.id} · {flagPct(b.id).toFixed(0)}%
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* stake a flag — only while open */}
                {sel?.status === ROUND_OPEN && (
                  <div className="dossier__action">
                    <label className="field">
                      <span>Flag stake (GEN)</span>
                      <input value={flagStake} inputMode="decimal" onChange={(e) => setFlagStake(e.target.value)} placeholder="e.g. 1" />
                    </label>
                    <button className="btn btn--gold full" disabled={!isConnected || !!busy} onClick={() => onFlag(selBatchRow.id)}>
                      <Flag size={18} weight="fill" /> Stake a flag
                    </button>
                    <p className="hint">Flag this batch as the worst offender. If the tribunal agrees, you split the slashed bond.</p>
                  </div>
                )}

                {/* dispute the ruling — worst-ruled seller only, while ruled */}
                {sel?.status === ROUND_RULED && sel.hasWorst && selBatchRow.id === sel.worstBatchId && !sel.disputed && (
                  <div className="dossier__action">
                    <label className="field">
                      <span>Dispute stake (GEN) — flagged seller only</span>
                      <input value={disputeStake} inputMode="decimal" onChange={(e) => setDisputeStake(e.target.value)} placeholder="e.g. 1" />
                    </label>
                    <button className="btn btn--ghost full" disabled={!isConnected || !!busy || !isWorstSeller} onClick={onDispute}>
                      <Scales size={18} weight="bold" /> Dispute the ruling
                    </button>
                    {!isWorstSeller && <p className="hint">Only the seller of this batch can stake to dispute the ruling.</p>}
                  </div>
                )}

                {selBatchRow.verdict && (
                  <button className="btn btn--ghost full" disabled={!isConnected || !!busy} onClick={() => onScore(selBatchRow.id)}>
                    <ArrowClockwise size={18} weight="bold" /> Re-score batch
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ---- flag leaderboard for this round ---- */}
        {selId != null && sel && leaderboard.length > 0 && (
          <section className="ledgerboard" aria-label="Flag leaderboard">
            <div className="ledgerboard__head">
              <h2 className="court__title"><Trophy size={20} weight="fill" /> Flag leaderboard</h2>
              <p className="court__sub">Heaviest flaggers in this round, by total stake. Derived from the round flags.</p>
            </div>
            <ol className="board-list">
              {leaderboard.map((row, i) => (
                <li className="board-row" key={row.flagger}>
                  <span className="board-rank">{i + 1}</span>
                  <span className="board-who">{shortAddr(row.flagger)}</span>
                  <span className="board-stat"><b>{gen(row.stake.toString())}</b> GEN staked</span>
                  <span className="board-stat muted">{row.count} flag{row.count === 1 ? "" : "s"}</span>
                  {row.won > 0n ? (
                    <span className="chip chip--won">+{gen(row.won.toString())} GEN</span>
                  ) : row.lost > 0 ? (
                    <span className="chip chip--lost">{row.lost} lost</span>
                  ) : (
                    <span className="chip chip--open">OPEN</span>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ---- precedent: settled past rulings ---- */}
        {precedent.length > 0 && (
          <section className="precedent" aria-label="Precedent, past rounds">
            <div className="precedent__head">
              <h2 className="court__title"><Stack size={20} weight="duotone" /> Precedent</h2>
              <p className="court__sub">Past rounds the tribunal has already ruled. Click to reopen a case on the stand.</p>
            </div>
            <div className="precedent__strip" role="list">
              {precedent.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="listitem"
                  className={`precedent__card ${selId === r.id ? "is-sel" : ""}`}
                  aria-label={`Past round ${r.id}, ${r.category || "untitled"}, worst batch ${r.worstBatchId}, ${gen(r.slashedWei)} GEN slashed`}
                  onClick={() => pickRound(r.id)}
                >
                  <div className="precedent__top">
                    <span className="docket__no">case/{String(r.id).padStart(4, "0")}</span>
                    <span className={`chip ${roundChipClass(r.status)}`}>{ROUND_STATUS[r.status]}</span>
                  </div>
                  <span className="precedent__cat">{r.category || "untitled round"}</span>
                  <div className="precedent__verdict">
                    <span className="seal seal--worst"><Scales size={11} weight="fill" /> #{r.worstBatchId}</span>
                    <span className="precedent__slash">{gen(r.slashedWei)} GEN slashed</span>
                  </div>
                  <div className="precedent__foot">
                    <span>{r.batchCount} in cohort</span>
                    <span className="gold">{r.confidence}% conf.</span>
                    {r.disputed && <span className="chip chip--disputed">DISPUTED</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="foot">
        <span className="brand__name small">Trueview</span>
        <span className="muted">A comparative review-fraud tribunal on GenLayer. Cohort, bond, flag, verdict, slash.</span>
        <span className="muted">
          contract{" "}
          <button type="button" className="copybtn" aria-label="Copy contract address" onClick={() => copyText(CONTRACT_ADDRESS)}>
            {shortAddr(CONTRACT_ADDRESS)} ⧉
          </button>
        </span>
      </footer>

      {/* ---- centered modal: open a round ---- */}
      <Modal
        open={openForm === "round"}
        onClose={() => setOpenForm(null)}
        kicker={<><PlusCircle size={15} weight="bold" /> New case</>}
        title="Open a round"
      >
        <label className="field">
          <span>Category</span>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. Best sushi in Lyon / wireless earbuds"
          />
        </label>
        <p className="hint">A round is a comparative lineup in one category. Businesses enter their review batch against each other.</p>
        <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={onOpenRound}>
          <PlusCircle size={18} weight="bold" /> Open the round
        </button>
        {!isConnected && <p className="muted">Connect a wallet to open a round.</p>}
      </Modal>

      {/* ---- centered modal: enter cohort ---- */}
      <Modal
        open={openForm === "batch" && selId != null}
        onClose={() => setOpenForm(null)}
        kicker={<><FileArrowUp size={15} weight="bold" /> Enter the cohort</>}
        title="Post a bond"
        statusChip={selId != null ? <span className="chip chip--open">case #{selId}</span> : undefined}
      >
        <label className="field">
          <span>Business / listing</span>
          <input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="business being reviewed" />
        </label>
        <label className="field">
          <span>Review batch (30 characters or more)</span>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Paste the batch of reviews: text, dates, account ages, posting bursts."
          />
        </label>
        <label className="field">
          <span>Authenticity bond (GEN)</span>
          <input value={bond} inputMode="decimal" onChange={(e) => setBond(e.target.value)} placeholder="e.g. 1" />
        </label>
        <p className="hint">Your bond is at risk. If the tribunal rules your batch the worst offender, the bond is slashed and split among flaggers.</p>
        <button className="btn btn--primary full" disabled={!isConnected || !!busy} onClick={onSubmitBatch}>
          <FileArrowUp size={18} weight="bold" /> Enter cohort
        </button>
        {!isConnected && <p className="muted">Connect a wallet to enter.</p>}
      </Modal>

      {(busy || note) && (
        <div className={`toast ${note ? "toast--err" : ""}`} role="status">
          {busy ? (<><ArrowClockwise size={16} weight="bold" className="spin" /> {busy}</>) : (<><WarningCircle size={16} weight="fill" /> {note}</>)}
        </div>
      )}
    </div>
  );
}
