import type { Career } from "./types";

// Save format version. Bump when the Career shape changes in a
// non-backwards-compatible way; the loader rejects mismatched majors.
export const SAVE_VERSION = 1;

const KEY_PREFIX = "sim-engine:career:";
const INDEX_KEY = "sim-engine:index";

export interface SaveSlot {
  id: string;
  themeId: string;
  name: string;
  age: number;
  phaseId: string;
  updatedAt: number;
}

interface StoredCareer {
  version: number;
  career: Career;
  updatedAt: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    // Some sandboxed iframes throw on access. Treat as no-storage.
    return null;
  }
}

export function saveCareer(career: Career): void {
  const s = storage();
  if (!s) return;
  const payload: StoredCareer = {
    version: SAVE_VERSION,
    career,
    updatedAt: Date.now(),
  };
  s.setItem(KEY_PREFIX + career.id, JSON.stringify(payload));
  updateIndex(career, payload.updatedAt);
}

export function loadCareer(id: string): Career | null {
  const s = storage();
  if (!s) return null;
  const raw = s.getItem(KEY_PREFIX + id);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCareer;
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed.career;
  } catch {
    return null;
  }
}

export function deleteCareer(id: string): void {
  const s = storage();
  if (!s) return;
  s.removeItem(KEY_PREFIX + id);
  const idx = readIndex(s).filter((slot) => slot.id !== id);
  s.setItem(INDEX_KEY, JSON.stringify(idx));
}

export function listCareers(): SaveSlot[] {
  const s = storage();
  if (!s) return [];
  return readIndex(s).sort((a, b) => b.updatedAt - a.updatedAt);
}

function readIndex(s: Storage): SaveSlot[] {
  const raw = s.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SaveSlot[]) : [];
  } catch {
    return [];
  }
}

function updateIndex(career: Career, updatedAt: number): void {
  const s = storage();
  if (!s) return;
  const idx = readIndex(s).filter((slot) => slot.id !== career.id);
  idx.push({
    id: career.id,
    themeId: career.themeId,
    name: career.name,
    age: career.age,
    phaseId: career.phaseId,
    updatedAt,
  });
  s.setItem(INDEX_KEY, JSON.stringify(idx));
}

// Export/import as JSON for sharing or backup.
export function exportCareer(career: Career): string {
  return JSON.stringify(
    { version: SAVE_VERSION, career } satisfies Omit<StoredCareer, "updatedAt">,
    null,
    2,
  );
}

export function importCareer(json: string): Career | null {
  try {
    const parsed = JSON.parse(json) as { version: number; career: Career };
    if (parsed.version !== SAVE_VERSION) return null;
    return parsed.career;
  } catch {
    return null;
  }
}
