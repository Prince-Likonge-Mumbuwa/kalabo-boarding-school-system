/**
 * The list of teachers the AI server has seen (storage/teachers.json) and
 * whether each may use the AI tools. A teacher is added as "pending" the
 * first time they open AI Tools; the superAdmin then grants or revokes.
 */
import path from "node:path";
import type { AccessState, AiSettings, TeacherRecord } from "../types.js";
import { AppError } from "../utils/errors.js";
import { JsonStore } from "../utils/JsonStore.js";

export function hasAccess(state: AccessState, mode: AiSettings["accessMode"]): boolean {
  return mode === "all" ? state !== "revoked" : state === "granted";
}

export class AccessService {
  private store: JsonStore<TeacherRecord[]>;

  constructor(dataDir: string) {
    this.store = new JsonStore(path.join(dataDir, "teachers.json"), () => []);
  }

  async list(): Promise<TeacherRecord[]> {
    return [...(await this.store.read())].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Called on every teacher request: remember them and refresh their details.
   * Saved to disk only when something changed or "last seen" is over five
   * minutes old, so a busy morning does not mean a file write per request.
   */
  async touch(teacher: { uid: string; email: string }, name: string): Promise<TeacherRecord> {
    const known = (await this.store.read()).find((t) => t.uid === teacher.uid);
    if (known && (!name || name === known.name) && (!teacher.email || teacher.email === known.email)
      && Date.now() - Date.parse(known.lastSeenAt) < 5 * 60_000)
      return { ...known };
    return this.store.update((teachers) => {
      const now = new Date().toISOString();
      let record = teachers.find((t) => t.uid === teacher.uid);
      if (!record) {
        record = { uid: teacher.uid, email: teacher.email, name: name || teacher.email, access: "pending", firstSeenAt: now, lastSeenAt: now };
        teachers.push(record);
      } else {
        record.lastSeenAt = now;
        record.email = teacher.email || record.email;
        if (name) record.name = name;
      }
      return { ...record };
    });
  }

  setAccess(uid: string, access: AccessState): Promise<TeacherRecord> {
    return this.store.update((teachers) => {
      const record = teachers.find((t) => t.uid === uid);
      if (!record) throw new AppError(404, "Teacher not found.", "not_found");
      record.access = access;
      return { ...record };
    });
  }
}
