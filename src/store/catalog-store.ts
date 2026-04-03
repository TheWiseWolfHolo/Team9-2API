import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DiscoveredModel } from "../provider/team9/models.js";

export type CatalogSnapshot = {
  models: DiscoveredModel[];
  discoveredAt: string | null;
};

export interface CatalogStore {
  loadCatalog(): Promise<CatalogSnapshot>;
  saveCatalog(snapshot: CatalogSnapshot): Promise<void>;
}

export class FileCatalogStore implements CatalogStore {
  constructor(private readonly filePath: string) {}

  async loadCatalog(): Promise<CatalogSnapshot> {
    try {
      const content = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(content) as CatalogSnapshot;
      return {
        models: Array.isArray(parsed.models) ? parsed.models : [],
        discoveredAt: parsed.discoveredAt ?? null,
      };
    } catch {
      return { models: [], discoveredAt: null };
    }
  }

  async saveCatalog(snapshot: CatalogSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf8");
  }
}
