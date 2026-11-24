/**
 * A tiny JSON-file "database". Settings, the teacher list and the curriculum list are
 * small, so each lives in one JSON file under storage/. Writes go to a
 * temporary file first and are then renamed, so a crash cannot leave a
 * half-written file behind.
 *
 * Many teachers at once (21 Nov 2026): the data is kept in memory, so reads
 * never touch the disk after the first. Saves are merged: changes made while
 * a save is under way are all written together by the next one, instead of
 * every request waiting in line for its own write. `update()` still resolves
 * only once its change is on disk. A rename that Windows refuses for a moment
 * (antivirus or backup holding the file) is tried again.
 */
import fs from "node:fs/promises";
import path from "node:path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class JsonStore<T> {
  private cache: T | null = null;
  private loading: Promise<T> | null = null;
  /** The save that will include the next change (null: none scheduled yet). */
  private pending: Promise<void> | null = null;
  /** The save under way, if any. */
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private file: string,
    private fallback: () => T,
    /** Indented JSON (easy to read by hand) or compact (large, busy files). */
    private options: { pretty?: boolean } = {},
  ) {}

  async read(): Promise<T> {
    if (this.cache !== null) return this.cache;
    // Requests arriving together share one read of the file.
    this.loading ??= (async () => {
      try {
        this.cache = JSON.parse(await fs.readFile(this.file, "utf8")) as T;
      } catch {
        this.cache = this.fallback();
      }
      return this.cache;
    })();
    return this.loading;
  }

  /** Applies a change in memory and resolves once it is saved. */
  async update<R>(change: (data: T) => R): Promise<R> {
    const data = await this.read();
    const result = change(data);
    await this.save();
    return result;
  }

  private save(): Promise<void> {
    if (!this.pending) {
      const run = this.writing.then(async () => {
        // From here on, new changes schedule another save; this one writes everything so far.
        this.pending = null;
        await this.write(JSON.stringify(this.cache, null, this.options.pretty === false ? undefined : 2));
      });
      this.pending = run;
      this.writing = run.catch(() => undefined);
    }
    return this.pending;
  }

  private async write(text: string) {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, text);
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, this.file);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) throw err;
        await sleep(40 * (attempt + 1));
      }
    }
  }
}
