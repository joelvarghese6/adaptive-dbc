import { randomUUID } from "node:crypto";
import type { AssetProfile, Launch } from "@adaptive/shared";

/** In-memory launch store. Swappable for a database later. */
const launches = new Map<string, Launch>();

function now(): string {
  return new Date().toISOString();
}

export function createLaunchRecord(asset: AssetProfile): Launch {
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
  return launch;
}

export function getLaunchRecord(id: string): Launch | null {
  return launches.get(id) ?? null;
}

export function updateLaunchRecord(id: string, patch: Partial<Launch>): Launch | null {
  const existing = launches.get(id);
  if (!existing) return null;
  const updated: Launch = { ...existing, ...patch, id, updatedAt: now() };
  launches.set(id, updated);
  return updated;
}

export function listLaunchRecords(): Launch[] {
  return [...launches.values()];
}

export function clearLaunchRecords(): void {
  launches.clear();
}
