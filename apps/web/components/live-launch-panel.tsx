"use client";

import { useState } from "react";
import { api, DEMO_RWA_ASSET, dataSourceLabel } from "@/lib/api";
import type { Launch, TransactionState } from "@/lib/api";

const TX_STATES: TransactionState[] = [
  "preparing",
  "awaiting_wallet",
  "submitted",
  "confirming",
  "confirmed",
];

function txLabel(state: TransactionState): string {
  switch (state) {
    case "preparing":
      return "Preparing";
    case "awaiting_wallet":
      return "Awaiting wallet";
    case "submitted":
      return "Submitted";
    case "confirming":
      return "Confirming";
    case "confirmed":
      return "Confirmed";
    case "failed":
      return "Failed";
  }
}

/**
 * Live backend panel for the Deploy step. Shows the real
 * Asset -> Strategy -> Simulation -> Devnet flow with explicit
 * data-source labels. Rendered alongside (not instead of) the
 * existing design; hidden behind a single opt-in click.
 */
export function LiveLaunchPanel() {
  const [launch, setLaunch] = useState<Launch | null>(null);
  const [txState, setTxState] = useState<TransactionState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ launch: Launch }>, state: TransactionState | null) {
    setBusy(true);
    setError(null);
    if (state) setTxState(state);
    try {
      const result = await fn();
      setLaunch(result.launch);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      if (state) setTxState("failed");
    } finally {
      setBusy(false);
    }
  }

  const deploy = () =>
    run(async () => {
      const created = launch ?? (await api.createLaunch(DEMO_RWA_ASSET)).launch;
      setTxState("preparing");
      const analyzed = (await api.analyze(created.id)).launch;
      setLaunch(analyzed);
      setTxState("submitted");
      const simulated = (await api.simulate(created.id)).launch;
      setLaunch(simulated);
      setTxState("confirming");
      const deployed = await api.deploy(created.id);
      setTxState(deployed.launch.deployment ? "confirmed" : "failed");
      return deployed;
    }, "preparing");

  return (
    <div className="mt-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] font-semibold">Live backend</div>
        {launch && (
          <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
            {dataSourceLabel(launch.deployment?.dataSource ?? launch.simulation?.dataSource ?? "mock")}
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        Runs the demo RWA asset through the real API: strategy analysis, deterministic simulation, then
        a real Devnet deployment when the backend wallet is configured.
      </p>
      {txState && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {TX_STATES.map((s) => (
            <span
              key={s}
              className={`rounded-md px-2 py-1 text-[10px] font-medium ${
                s === txState ? "bg-[#18181b] text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {txLabel(s)}
            </span>
          ))}
          {txState === "failed" && (
            <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-700">Failed</span>
          )}
        </div>
      )}
      {launch?.strategy && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Strategy: <span className="font-medium text-foreground">{launch.strategy.strategyId}</span>{" "}
          ({Math.round(launch.strategy.confidence * 100)}% confidence)
        </div>
      )}
      {launch?.simulation && (
        <div className="mt-1 text-[11px] text-muted-foreground">
          Simulation: {launch.simulation.estimatedGraduationDays}d to graduation [simulation only]
        </div>
      )}
      {launch?.deployment && (
        <div className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
          <div>pool: {launch.deployment.poolAddress}</div>
          <div>config: {launch.deployment.configAddress}</div>
          {launch.deployment.transactionSignatures.map((sig) => (
            <div key={sig}>tx: {sig}</div>
          ))}
        </div>
      )}
      {error && <div className="mt-2 text-[11px] text-red-600">{error}</div>}
      <button
        onClick={deploy}
        disabled={busy}
        className="mt-3 rounded-md bg-[#18181b] px-4 py-2 text-[12px] font-medium text-white hover:bg-[#27272a] disabled:opacity-40"
      >
        {busy ? "Working…" : "Run live backend flow"}
      </button>
    </div>
  );
}
