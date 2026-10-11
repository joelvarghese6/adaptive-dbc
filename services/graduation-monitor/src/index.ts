import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { GraduationEvent } from "@adaptive/shared";
import { log } from "@adaptive/shared";
import { evaluateGraduation } from "@adaptive/meteora";

export interface WatchedPool {
  poolAddress: string;
  configAddress: string;
  rpcUrl: string;
  knownDammV2PoolAddress?: string;
  lastProgress: number | null;
  graduated: boolean;
  updatedAt: string;
}

/**
 * Graduation monitor: watches known DBC pools, evaluates real on-chain
 * graduation state, and persists state changes. Never claims graduation
 * from timers or mock values.
 */
export class GraduationMonitor {
  private pools = new Map<string, WatchedPool>();
  private readonly statePath: string;

  constructor(statePath?: string) {
    this.statePath =
      statePath ?? join(process.cwd(), ".data", "graduation-monitor.json");
    this.load();
  }

  watch(pool: Omit<WatchedPool, "lastProgress" | "graduated" | "updatedAt">): WatchedPool {
    const entry: WatchedPool = {
      ...pool,
      lastProgress: null,
      graduated: false,
      updatedAt: new Date().toISOString(),
    };
    this.pools.set(pool.poolAddress, entry);
    this.save();
    return entry;
  }

  async check(poolAddress: string): Promise<GraduationEvent | null> {
    const watched = this.pools.get(poolAddress);
    if (!watched) throw new Error(`Pool ${poolAddress} is not watched.`);
    const { graduated, progress, event } = await evaluateGraduation({
      rpcUrl: watched.rpcUrl,
      poolAddress: watched.poolAddress,
      configAddress: watched.configAddress,
      knownDammV2PoolAddress: watched.knownDammV2PoolAddress,
    });
    watched.lastProgress = progress;
    watched.updatedAt = new Date().toISOString();
    if (graduated && !watched.graduated) {
      watched.graduated = true;
      log("info", "Graduation detected", {
        poolAddress: watched.poolAddress,
        configAddress: watched.configAddress,
      });
    }
    this.save();
    return event;
  }

  async checkAll(): Promise<GraduationEvent[]> {
    const events: GraduationEvent[] = [];
    for (const address of this.pools.keys()) {
      const event = await this.check(address);
      if (event) events.push(event);
    }
    return events;
  }

  list(): WatchedPool[] {
    return [...this.pools.values()];
  }

  private load(): void {
    try {
      if (!existsSync(this.statePath)) return;
      const raw = JSON.parse(readFileSync(this.statePath, "utf8")) as WatchedPool[];
      for (const entry of raw) this.pools.set(entry.poolAddress, entry);
    } catch {
      // Corrupt state starts empty rather than crashing the monitor.
    }
  }

  private save(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify([...this.pools.values()], null, 2));
  }
}
