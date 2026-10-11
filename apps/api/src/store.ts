import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AssetProfile, Launch } from "@adaptive/shared";
import { CheckpointError } from "@adaptive/shared";
import { writeFileAtomicSync } from "./atomic-file.js";

/**
 * In-memory launch store, optionally mirrored to a JSON file so a process
 * restart cannot silently lose an existing deployment (in particular the base
 * mint address, which must never be re-created).
 *
 * Durability is enabled by setting `LAUNCH_STORE_FILE` (e.g.
 * `.devnet-launches/api-launches.json`). When it is unset the store behaves
 * exactly as before (in-memory only).
 */
const launches = new Map<string, Launch>();
let hydrated = false;

function now(): string {
  return new Date().toISOString();
}

/** The durable store path, or null when persistence is disabled. */
export function launchStoreFile(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = env["LAUNCH_STORE_FILE"];
  return file && file.trim().length > 0 ? file.trim() : null;
}

function ensureHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  const file = launchStoreFile();
  if (file) hydrateLaunchRecords(file);
}

function persist(): void {
  const file = launchStoreFile();
  if (file) persistLaunchRecords(file);
}

/**
 * Write the current records to `file` atomically. Exported so tests can model a
 * restart without re-importing the module.
 */
export function persistLaunchRecords(file: string): void {
  writeFileAtomicSync(file, `${JSON.stringify(listLaunchRecords(), null, 2)}\n`, "launch store");
}

/**
 * Load records from `file` into memory, returning how many were loaded. A
 * missing file is an empty store; a corrupt file throws `CheckpointError` so
 * the process fails safe instead of starting with no mint records.
 */
export function hydrateLaunchRecords(file: string): number {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw new CheckpointError(
      `Unable to read launch store ${file}: ${err instanceof Error ? err.message : String(err)}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CheckpointError(
      `Launch store ${file} is corrupt; refusing to start with an empty store (that could allow a second mint).`,
    );
  }
  if (!Array.isArray(parsed))
    throw new CheckpointError(`Launch store ${file} is malformed (expected an array of launches).`);

  let loaded = 0;
  for (const item of parsed) {
    if (item && typeof item === "object" && typeof (item as Launch).id === "string") {
      launches.set((item as Launch).id, item as Launch);
      loaded += 1;
    }
  }
  return loaded;
}

export function createLaunchRecord(asset: AssetProfile): Launch {
  ensureHydrated();
  const id = randomUUID();
  const launch: Launch = {
    id,
    asset,
    strategy: null,
    simulation: null,
    deployment: null,
    status: "draft",
    dataSource: "mock",
    createdAt: now(),
    updatedAt: now(),
  };
  launches.set(id, launch);
  persist();
  return launch;
}

export function getLaunchRecord(id: string): Launch | null {
  ensureHydrated();
  return launches.get(id) ?? null;
}

export function updateLaunchRecord(id: string, patch: Partial<Launch>): Launch | null {
  ensureHydrated();
  const existing = launches.get(id);
  if (!existing) return null;
  const updated: Launch = { ...existing, ...patch, id, updatedAt: now() };
  launches.set(id, updated);
  persist();
  return updated;
}

export function listLaunchRecords(): Launch[] {
  return [...launches.values()];
}

export function clearLaunchRecords(): void {
  launches.clear();
  // Keep the durable store consistent with memory, but only when enabled.
  const file = launchStoreFile();
  if (file) writeFileAtomicSync(file, "[]\n", "launch store");
}

/** Test-only hook: allow re-hydration after an in-memory reset. */
export function resetHydrationForTests(): void {
  hydrated = false;
}
