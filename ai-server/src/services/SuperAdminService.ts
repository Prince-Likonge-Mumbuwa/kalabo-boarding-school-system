/**
 * The one superAdmin account. It lives in storage/superadmin.json, not in
 * Firebase:
 *
 *   - `create` runs once (npm run create-superadmin) and refuses to run again;
 *   - the password is never saved, only a scrypt hash of it;
 *   - `login` hands out a signed token that expires after SESSION_HOURS;
 *   - `verify` checks that token on every superAdmin request.
 */
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AppError } from "../utils/errors.js";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

interface Account {
  email: string;
  salt: string;
  hash: string;
  /** Signs session tokens. Created with the account, so deleting the account ends every session. */
  sessionSecret: string;
  createdAt: string;
}

const MAX_FAILURES = 5;
const LOCK_MINUTES = 1;

export class SuperAdminService {
  private file: string;
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    dataDir: string,
    private sessionHours: number,
  ) {
    this.file = path.join(dataDir, "superadmin.json");
  }

  /** Read from disk every time, so an account created while the server runs is seen at once. */
  private async account(): Promise<Account | null> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf8")) as Account;
    } catch {
      return null;
    }
  }

  async exists(): Promise<boolean> {
    return (await this.account()) !== null;
  }

  async create(email: string, password: string): Promise<void> {
    if (await this.exists())
      throw new AppError(409, "A superAdmin account already exists. It can only be created once.", "already_exists");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, "SUPERADMIN_EMAIL is not a valid email address.", "invalid_email");
    if (password.length < 10) throw new AppError(400, "SUPERADMIN_PASSWORD must be at least 10 characters.", "weak_password");
    const salt = randomBytes(16);
    const account: Account = {
      email: email.toLowerCase(),
      salt: salt.toString("hex"),
      hash: (await scryptAsync(password, salt, 64)).toString("hex"),
      sessionSecret: randomBytes(32).toString("hex"),
      createdAt: new Date().toISOString(),
    };
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    // "wx" fails if the file already exists, so two runs can never both succeed.
    await fs.writeFile(this.file, JSON.stringify(account, null, 2), { flag: "wx" });
  }

  /** `client` identifies who is trying (their network address), for the lock after repeated failures. */
  async login(email: string, password: string, client: string): Promise<{ token: string; expiresAt: string }> {
    const lock = this.failures.get(client);
    if (lock && lock.lockedUntil > Date.now())
      throw new AppError(429, `Too many failed sign-ins. Try again in ${LOCK_MINUTES} minutes.`, "locked");

    const account = await this.account();
    if (!account) throw new AppError(503, "No superAdmin account exists yet. Run: npm run create-superadmin", "not_created");

    const hash = await scryptAsync(password, Buffer.from(account.salt, "hex"), 64);
    const ok = email.toLowerCase() === account.email && timingSafeEqual(hash, Buffer.from(account.hash, "hex"));
    if (!ok) {
      const count = (lock?.count ?? 0) + 1;
      this.failures.set(client, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MINUTES * 60_000 : 0 });
      throw new AppError(401, "Wrong email or password.", "invalid_credentials");
    }
    this.failures.delete(client);

    const expires = Date.now() + this.sessionHours * 3_600_000;
    const payload = Buffer.from(JSON.stringify({ exp: expires })).toString("base64url");
    return { token: `${payload}.${this.sign(payload, account.sessionSecret)}`, expiresAt: new Date(expires).toISOString() };
  }

  async verify(token: string): Promise<boolean> {
    const account = await this.account();
    const [payload, signature] = token.split(".");
    if (!account || !payload || !signature) return false;
    const expected = Buffer.from(this.sign(payload, account.sessionSecret));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
    try {
      return (JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp: number }).exp > Date.now();
    } catch {
      return false;
    }
  }

  private sign(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("base64url");
  }
}
