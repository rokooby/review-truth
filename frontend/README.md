# Trueview

Comparative review-fraud tribunal on GenLayer. A curator opens a round and competing businesses enter a cohort by posting a GEN bond with their review batch. Anyone can stake GEN to flag the batch they think is the worst offender. When the round closes a panel of GenLayer validators reads the whole cohort and agrees on a single worst batch id and the cleanest batch id by partial field matching, exactly like an impartial judge picking a winner. The worst batch is ruled FRAUDULENT and its bond is slashed, flaggers who bet on it split the slash pro-rata to their stake, the cleanest batch keeps an AUTHENTIC badge, and the flagged seller can stake to dispute the ruling for an independent re-judge.

## Contract

- Network: GenLayer Studionet (chain id 61999)
- Address: `0x8C592A76A126513F86ca1fcFa6df1F247cb09f15`

## Methods

open_round, submit_batch (payable), flag_batch (payable), close_and_judge, settle_round, score_batch, dispute_ruling (payable), plus get_round, get_batch, get_round_batches, get_flag, get_round_flags, get_counts.

## Run

```bash
npm install
npm run dev
npm run build
```
