/**
 * The pilot's books (storage/finance.json): money teachers pay for the AI
 * tools, and money paid to the services the system runs on (DeepInfra,
 * Hostinger, the domain ...). All amounts are in ZMW.
 *
 * Fees: granting a teacher access counts as a payment of the term fee
 * (ZMW 300 unless the superAdmin changes it) for the current school term.
 * Once per teacher per term: withdrawing and granting again in the same term
 * records nothing new. Access does not end when a term ends; the console
 * lists granted teachers who have not paid for the current term.
 *
 * Nothing is ever deleted. A wrong entry is voided with a reason and stays
 * in the books (shown struck through, left out of the totals), so every
 * kwacha can be accounted for.
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FeePayment, FinanceData, FinanceSummary, FinanceView, SchoolTerm, ServicePayment, TeacherRecord } from "../types.js";
import { AppError } from "../utils/errors.js";
import { JsonStore } from "../utils/JsonStore.js";

export const DEFAULT_TERM_FEE = 300;

/** The school term a date falls in: Term 1 Jan–Apr, Term 2 May–Aug, Term 3 Sep–Dec (as in the school app). */
export function termOf(date: Date): { term: SchoolTerm; year: number } {
  const m = date.getMonth();
  return { term: m <= 3 ? "Term 1" : m <= 7 ? "Term 2" : "Term 3", year: date.getFullYear() };
}

/** "2026-11-24" in local time (the school's day, not UTC). */
export function ymd(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

const termKey = (t: { term: SchoolTerm; year: number }) => `${t.year} ${t.term}`;
const live = <T extends { voided?: unknown }>(rows: T[]) => rows.filter((r) => !r.voided);

const empty = (): FinanceData => ({ termFee: DEFAULT_TERM_FEE, payments: [], expenses: [] });

export function summarize(data: FinanceData, teachers: TeacherRecord[], now: Date): FinanceSummary {
  const current = termOf(now);
  const payments = live(data.payments);
  const expenses = live(data.expenses);
  const received = payments.reduce((s, p) => s + p.amount, 0);
  const paidOut = expenses.reduce((s, e) => s + e.amount, 0);

  // Per term, newest first. Expenses are placed in the term of the day they were paid.
  const terms = new Map<string, { term: SchoolTerm; year: number; received: number; paidOut: number; teachers: number }>();
  const row = (t: { term: SchoolTerm; year: number }) => {
    const key = termKey(t);
    if (!terms.has(key)) terms.set(key, { ...t, received: 0, paidOut: 0, teachers: 0 });
    return terms.get(key)!;
  };
  row(current);
  for (const p of payments) { const r = row(p); r.received += p.amount; r.teachers += 1; }
  for (const e of expenses) row(termOf(new Date(`${e.paidOn}T12:00:00`))).paidOut += e.amount;

  const paidNow = new Set(payments.filter((p) => p.term === current.term && p.year === current.year).map((p) => p.teacherUid));
  const unpaid = teachers.filter((t) => t.access === "granted" && !paidNow.has(t.uid)).map((t) => ({ uid: t.uid, name: t.name, email: t.email }));

  return {
    currentTerm: current,
    received,
    paidOut,
    balance: received - paidOut,
    byTerm: [...terms.values()].sort((a, b) => b.year - a.year || b.term.localeCompare(a.term)),
    unpaid,
  };
}

export class FinanceService {
  private store: JsonStore<FinanceData>;

  constructor(dataDir: string, private clock: () => Date = () => new Date()) {
    this.store = new JsonStore(path.join(dataDir, "finance.json"), empty);
  }

  private async data(): Promise<FinanceData> {
    const d = await this.store.read();
    d.termFee ??= DEFAULT_TERM_FEE;
    d.payments ??= [];
    d.expenses ??= [];
    return d;
  }

  async view(teachers: TeacherRecord[]): Promise<FinanceView> {
    const d = await this.data();
    const byNewest = <T extends { recordedAt: string }>(a: T, b: T) => b.recordedAt.localeCompare(a.recordedAt);
    return {
      termFee: d.termFee,
      payments: [...d.payments].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || byNewest(a, b)),
      expenses: [...d.expenses].sort((a, b) => b.paidOn.localeCompare(a.paidOn) || byNewest(a, b)),
      summary: summarize(d, teachers, this.clock()),
    };
  }

  /**
   * A teacher was just granted access: record the term fee for the current
   * term, unless they already have a payment for it. Returns the new entry, if any.
   */
  async recordGrant(teacher: TeacherRecord): Promise<FeePayment | null> {
    await this.data();
    return this.store.update((d) => {
      const now = this.clock();
      const t = termOf(now);
      if (live(d.payments).some((p) => p.teacherUid === teacher.uid && p.term === t.term && p.year === t.year)) return null;
      const payment: FeePayment = {
        id: randomUUID(), teacherUid: teacher.uid, teacherName: teacher.name, teacherEmail: teacher.email,
        term: t.term, year: t.year, amount: d.termFee, receivedOn: ymd(now), recordedAt: now.toISOString(), source: "grant",
      };
      d.payments.push(payment);
      return payment;
    });
  }

  /** A payment entered by hand (a teacher already granted, or a late payment). */
  async addPayment(input: { teacher: TeacherRecord; term: SchoolTerm; year: number; amount?: number; receivedOn?: string; reference?: string; note?: string }): Promise<FeePayment> {
    await this.data();
    return this.store.update((d) => {
      const { teacher, term, year } = input;
      if (live(d.payments).some((p) => p.teacherUid === teacher.uid && p.term === term && p.year === year))
        throw new AppError(409, `${teacher.name} has already paid for ${term} ${year}. Void that entry first to replace it.`, "already_paid");
      const now = this.clock();
      const payment: FeePayment = {
        id: randomUUID(), teacherUid: teacher.uid, teacherName: teacher.name, teacherEmail: teacher.email,
        term, year, amount: input.amount ?? d.termFee, receivedOn: input.receivedOn ?? ymd(now), recordedAt: now.toISOString(),
        source: "manual", ...(input.reference ? { reference: input.reference } : {}), ...(input.note ? { note: input.note } : {}),
      };
      d.payments.push(payment);
      return payment;
    });
  }

  async addExpense(input: { paidOn: string; provider: string; description: string; amount: number; reference?: string }): Promise<ServicePayment> {
    await this.data();
    return this.store.update((d) => {
      const expense: ServicePayment = {
        id: randomUUID(), paidOn: input.paidOn, provider: input.provider, description: input.description, amount: input.amount,
        recordedAt: this.clock().toISOString(), ...(input.reference ? { reference: input.reference } : {}),
      };
      d.expenses.push(expense);
      return expense;
    });
  }

  /** Voids an entry (a fee payment or a provider payment). It stays in the books, out of the totals. */
  async void(kind: "payment" | "expense", id: string, reason: string): Promise<FeePayment | ServicePayment> {
    await this.data();
    return this.store.update((d) => {
      const rows: Array<FeePayment | ServicePayment> = kind === "payment" ? d.payments : d.expenses;
      const entry = rows.find((r) => r.id === id);
      if (!entry) throw new AppError(404, "That entry was not found.", "not_found");
      if (entry.voided) throw new AppError(409, "That entry is already voided.", "already_voided");
      entry.voided = { at: this.clock().toISOString(), reason };
      return entry;
    });
  }

  /** The fee for one term. Entries already recorded keep the amount they were recorded with. */
  async setTermFee(amount: number): Promise<number> {
    await this.data();
    return this.store.update((d) => (d.termFee = amount));
  }
}
