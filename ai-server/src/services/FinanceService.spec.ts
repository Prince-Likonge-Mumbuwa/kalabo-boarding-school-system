import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TeacherRecord } from "../types.js";
import { FinanceService, termOf } from "./FinanceService.js";

const teacher = (uid: string, access: TeacherRecord["access"] = "granted"): TeacherRecord => ({
  uid, email: `${uid}@school.zm`, name: `Teacher ${uid.toUpperCase()}`, access, firstSeenAt: "", lastSeenAt: "",
});

describe("finances", () => {
  let dir: string;
  let now: Date;
  let finance: FinanceService;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "finance-"));
    now = new Date(2026, 10, 24, 9, 0); // 24 Nov 2026: Term 3
    finance = new FinanceService(dir, () => now);
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("knows the school terms", () => {
    expect(termOf(new Date(2026, 0, 5))).toEqual({ term: "Term 1", year: 2026 });
    expect(termOf(new Date(2026, 3, 30))).toEqual({ term: "Term 1", year: 2026 });
    expect(termOf(new Date(2026, 4, 1))).toEqual({ term: "Term 2", year: 2026 });
    expect(termOf(new Date(2026, 8, 1))).toEqual({ term: "Term 3", year: 2026 });
  });

  it("a grant records ZMW 300 for the current term, once per term", async () => {
    const a = teacher("a");
    const first = await finance.recordGrant(a);
    expect(first).toMatchObject({ amount: 300, term: "Term 3", year: 2026, receivedOn: "2026-11-24", source: "grant" });
    // Withdrawn and granted again in the same term: nothing new.
    expect(await finance.recordGrant(a)).toBeNull();
    // Next term the fee is due again.
    now = new Date(2027, 0, 10);
    expect(await finance.recordGrant(a)).toMatchObject({ term: "Term 1", year: 2027 });
    const view = await finance.view([a]);
    expect(view.summary.received).toBe(600);
  });

  it("lists granted teachers who have not paid this term", async () => {
    const paid = teacher("p");
    const unpaid = teacher("u");
    const waiting = teacher("w", "pending");
    await finance.recordGrant(paid);
    const { summary } = await finance.view([paid, unpaid, waiting]);
    expect(summary.unpaid.map((t) => t.uid)).toEqual(["u"]);
  });

  it("totals income and provider payments; a voided entry stays listed but leaves the totals", async () => {
    const a = teacher("a");
    const b = teacher("b");
    await finance.recordGrant(a);
    const pb = await finance.addPayment({ teacher: b, term: "Term 3", year: 2026, reference: "MTN 123" });
    await finance.addExpense({ paidOn: "2026-11-20", provider: "DeepInfra", description: "API credit", amount: 260.5 });
    let view = await finance.view([a, b]);
    expect(view.summary).toMatchObject({ received: 600, paidOut: 260.5, balance: 339.5 });
    expect(view.summary.byTerm[0]).toMatchObject({ term: "Term 3", year: 2026, received: 600, paidOut: 260.5, teachers: 2 });

    await finance.void("payment", pb.id, "Entered twice");
    view = await finance.view([a, b]);
    expect(view.summary.received).toBe(300);
    expect(view.payments.find((p) => p.id === pb.id)?.voided?.reason).toBe("Entered twice");
    expect(view.summary.unpaid.map((t) => t.uid)).toEqual(["b"]);
  });

  it("refuses a second payment for the same teacher and term", async () => {
    const a = teacher("a");
    await finance.recordGrant(a);
    await expect(finance.addPayment({ teacher: a, term: "Term 3", year: 2026 })).rejects.toThrow(/already paid/);
  });

  it("a new fee applies to new entries only", async () => {
    const a = teacher("a");
    const b = teacher("b");
    await finance.recordGrant(a);
    await finance.setTermFee(350);
    await finance.recordGrant(b);
    const { payments } = await finance.view([a, b]);
    expect(payments.map((p) => [p.teacherUid, p.amount]).sort()).toEqual([["a", 300], ["b", 350]]);
  });

  it("keeps the books on disk", async () => {
    await finance.recordGrant(teacher("a"));
    const again = new FinanceService(dir, () => now);
    expect((await again.view([])).summary.received).toBe(300);
  });
});
