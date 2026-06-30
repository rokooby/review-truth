import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS } from "./chain";

type Hex = `0x${string}`;
const TIMEOUT_MS = 240_000;

// ---- Round.status ---------------------------------------------------------
export const ROUND_OPEN = 0;
export const ROUND_RULED = 1;
export const ROUND_SETTLED = 2;
export const ROUND_STATUS = ["OPEN", "RULED", "SETTLED"];

// ---- Batch.status ---------------------------------------------------------
export const BATCH_ENTERED = 0;
export const BATCH_AUTHENTIC = 1;
export const BATCH_SUSPECT = 2;
export const BATCH_FRAUDULENT = 3;
export const BATCH_CLOSED = 4;
export const BATCH_STATUS = ["ENTERED", "AUTHENTIC", "SUSPECT", "FRAUDULENT", "CLOSED"];

// ---- Flag.status ----------------------------------------------------------
export const FLAG_OPEN = 0;
export const FLAG_WON = 1;
export const FLAG_LOST = 2;
export const FLAG_STATUS = ["OPEN", "WON", "LOST"];

export type Verdict = "AUTHENTIC" | "SUSPECT" | "FRAUDULENT" | "";

// Field order mirrors the Round dataclass exactly.
export interface RoundView {
  curator: string;
  category: string;
  status: number;
  batchCount: number;
  worstBatchId: number;
  cleanestBatchId: number;
  worstSuspectPct: number;
  confidence: number;
  hasWorst: boolean;
  slashedWei: string;
  distributedWei: string;
  reasoning: string;
  disputed: boolean;
}
export interface RoundRow extends RoundView { id: number; }

// Field order mirrors the Batch dataclass exactly.
export interface BatchView {
  roundId: number;
  seller: string;
  business: string;
  evidence: string;
  bond: string;
  status: number;
  verdict: Verdict;
  suspectPct: number;
  refunded: boolean;
}
export interface BatchRow extends BatchView { id: number; }

// Field order mirrors the Flag dataclass exactly.
export interface FlagView {
  roundId: number;
  batchId: number;
  flagger: string;
  stake: string;
  status: number;
  payout: string;
}
export interface FlagRow extends FlagView { id: number; }

export interface Counts {
  nextRound: number;
  nextBatch: number;
  nextFlag: number;
  ruled: number;
  fraudulent: number;
  pool: string;
}

function readClient() { return createClient({ chain: studionet, account: createAccount() }); }
function writeClient(account: Hex) { return createClient({ chain: studionet, account }); }

async function waitAccepted(client: any, hash: Hex) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Transaction timed out")), TIMEOUT_MS);
  });
  try {
    await Promise.race([
      client.waitForTransactionReceipt({ hash: hash as never, status: TransactionStatus.ACCEPTED, interval: 5000, retries: 64 }),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Field accessor that works whether genlayer-js returns an object or a tuple.
function pick(obj: any, key: string, idx: number): any {
  if (obj == null) return undefined;
  if (Array.isArray(obj)) return obj[idx];
  if (typeof obj === "object" && key in obj) return obj[key];
  return undefined;
}

async function write(account: Hex, functionName: string, args: any[], value: bigint): Promise<void> {
  const wc = writeClient(account);
  const h = (await wc.writeContract({ address: CONTRACT_ADDRESS as Hex, functionName, args, value })) as Hex;
  await waitAccepted(wc, h);
}

async function read(functionName: string, args: any[]): Promise<any> {
  return readClient().readContract({ address: CONTRACT_ADDRESS as Hex, functionName, args });
}

function idList(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

// ----------------------------- writes --------------------------------------

export async function openRound(account: Hex, category: string): Promise<number> {
  await write(account, "open_round", [category.trim()], 0n);
  const c = await getCounts();
  return c.nextRound - 1;
}

export async function submitBatch(account: Hex, roundId: number, business: string, evidence: string, bondWei: bigint): Promise<number> {
  if (bondWei <= 0n) throw new Error("Bond must be > 0");
  await write(account, "submit_batch", [roundId, business.trim(), evidence.trim()], bondWei);
  const c = await getCounts();
  return c.nextBatch - 1;
}

export async function flagBatch(account: Hex, batchId: number, stakeWei: bigint): Promise<number> {
  if (stakeWei <= 0n) throw new Error("Stake must be > 0");
  await write(account, "flag_batch", [batchId], stakeWei);
  const c = await getCounts();
  return c.nextFlag - 1;
}

export async function closeAndJudge(account: Hex, roundId: number): Promise<void> {
  await write(account, "close_and_judge", [roundId], 0n);
}

export async function settleRound(account: Hex, roundId: number): Promise<void> {
  await write(account, "settle_round", [roundId], 0n);
}

export async function scoreBatch(account: Hex, batchId: number): Promise<void> {
  await write(account, "score_batch", [batchId], 0n);
}

export async function disputeRuling(account: Hex, roundId: number, stakeWei: bigint): Promise<void> {
  if (stakeWei <= 0n) throw new Error("Stake must be > 0");
  await write(account, "dispute_ruling", [roundId], stakeWei);
}

// ----------------------------- reads ---------------------------------------

export async function getRound(roundId: number): Promise<RoundView> {
  const r: any = await read("get_round", [roundId]);
  return {
    curator: String(pick(r, "curator", 0) ?? ""),
    category: String(pick(r, "category", 1) ?? ""),
    status: Number(pick(r, "status", 2) ?? 0),
    batchCount: Number(pick(r, "batch_count", 3) ?? 0),
    worstBatchId: Number(pick(r, "worst_batch_id", 4) ?? 0),
    cleanestBatchId: Number(pick(r, "cleanest_batch_id", 5) ?? 0),
    worstSuspectPct: Number(pick(r, "worst_suspect_pct", 6) ?? 0),
    confidence: Number(pick(r, "confidence", 7) ?? 0),
    hasWorst: Boolean(pick(r, "has_worst", 8) ?? false),
    slashedWei: String(pick(r, "slashed_wei", 9) ?? "0"),
    distributedWei: String(pick(r, "distributed_wei", 10) ?? "0"),
    reasoning: String(pick(r, "reasoning", 11) ?? ""),
    disputed: Boolean(pick(r, "disputed", 12) ?? false),
  };
}

export async function getBatch(batchId: number): Promise<BatchView> {
  const r: any = await read("get_batch", [batchId]);
  return {
    roundId: Number(pick(r, "round_id", 0) ?? 0),
    seller: String(pick(r, "seller", 1) ?? ""),
    business: String(pick(r, "business", 2) ?? ""),
    evidence: String(pick(r, "evidence", 3) ?? ""),
    bond: String(pick(r, "bond", 4) ?? "0"),
    status: Number(pick(r, "status", 5) ?? 0),
    verdict: String(pick(r, "verdict", 6) ?? "") as Verdict,
    suspectPct: Number(pick(r, "suspect_pct", 7) ?? 0),
    refunded: Boolean(pick(r, "refunded", 8) ?? false),
  };
}

export async function getFlag(flagId: number): Promise<FlagView> {
  const r: any = await read("get_flag", [flagId]);
  return {
    roundId: Number(pick(r, "round_id", 0) ?? 0),
    batchId: Number(pick(r, "batch_id", 1) ?? 0),
    flagger: String(pick(r, "flagger", 2) ?? ""),
    stake: String(pick(r, "stake", 3) ?? "0"),
    status: Number(pick(r, "status", 4) ?? 0),
    payout: String(pick(r, "payout", 5) ?? "0"),
  };
}

export async function getRoundBatches(roundId: number): Promise<BatchRow[]> {
  const ids = idList(await read("get_round_batches", [roundId]));
  const rows = await Promise.all(ids.map(async (id) => {
    try { return { id, ...(await getBatch(id)) }; } catch { return null; }
  }));
  return rows.filter((r): r is BatchRow => r !== null);
}

export async function getRoundFlags(roundId: number): Promise<FlagRow[]> {
  const ids = idList(await read("get_round_flags", [roundId]));
  const rows = await Promise.all(ids.map(async (id) => {
    try { return { id, ...(await getFlag(id)) }; } catch { return null; }
  }));
  return rows.filter((r): r is FlagRow => r !== null);
}

export async function getCounts(): Promise<Counts> {
  const r: any = await read("get_counts", []);
  const p = String(r ?? "").split("||");
  const num = (i: number) => Number(p[i]) || 0;
  return {
    nextRound: num(0),
    nextBatch: num(1),
    nextFlag: num(2),
    ruled: num(3),
    fraudulent: num(4),
    pool: p[5] ?? "0",
  };
}

export async function listRounds(maxRows = 60): Promise<RoundRow[]> {
  const { nextRound } = await getCounts();
  if (nextRound === 0) return [];
  const ids: number[] = [];
  for (let i = nextRound - 1; i >= 0 && i >= nextRound - maxRows; i--) ids.push(i);
  const rows = await Promise.all(ids.map(async (id) => {
    try { return { id, ...(await getRound(id)) }; } catch { return null; }
  }));
  return rows.filter((r): r is RoundRow => r !== null);
}
