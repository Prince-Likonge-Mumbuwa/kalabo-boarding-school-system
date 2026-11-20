/**
 * A tiny JSON-file "database". Settings, the teacher list and the curriculum list are
 * small, so each lives in one JSON file under storage/. Writes go to a
 * temporary file first and are then renamed, so a crash cannot leave a
 * half-written file behind.
 */
import fs from "node:fs/promises";
import path from "node:path";

export class JsonStore<T> {
  private cache: T | null = null;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private file: string,
    private fallback: () => T,
  ) {}

  async read(): Promise<T> {
    if (this.cache === null) {
      try {
        this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as T;
      } catch {
        this.cache = this.fallback();
      }
    }
    return this.cache;
  }

  /** Applies a change and saves. Calls are queued so writes never overlap. */
  async update<R>(change: (data: T) => R): Promise<R> {
    const data = await this.read();
    const result = change(data);
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, this.file);
    });
    await this.queue;
    return result;
  }
}
