// @/components/admissions/admissionSlip.ts
//
// The printed admission slip: one A4 page with two identical halves, the
// GUARDIAN'S COPY and the SCHOOL'S COPY, cut along the dashed line.
// Printed through a hidden iframe so the app itself is not printed.

import type { AdmissionRecord } from '@/types/admissions';
import { SCHOOL_LOGO_URL } from '@/lib/schoolLogo';

export const SCHOOL_NAME = 'Kalabo Boarding Secondary School';

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const fmtDate = (v: any) => {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return String(v ?? '');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const TYPE_LABEL: Record<string, string> = { new_intake: 'New intake', transfer_in: 'Transfer in' };

function half(r: AdmissionRecord, copy: string, logoUrl: string): string {
  const row = (label: string, value: unknown) =>
    `<tr><th>${esc(label)}</th><td>${esc(value) || '—'}</td></tr>`;
  return `
  <section class="slip">
    <header>
      <img src="${esc(logoUrl)}" alt="" onerror="this.style.display='none'" />
      <div>
        <div class="school">${esc(SCHOOL_NAME)}</div>
        <div class="title">ADMISSION SLIP · ${esc(r.year)}</div>
      </div>
      <div class="copy">${esc(copy)}</div>
    </header>
    <div class="ids">
      <div><span>Student ID</span><b>${esc(r.studentId)}</b></div>
      <div><span>Class</span><b>${esc(r.className)}</b></div>
      <div><span>Admission No.</span><b>${esc(r.admissionNumber)}</b></div>
    </div>
    <div class="cols">
      <table>
        ${row('Learner', r.fullName)}
        ${row('Gender', r.gender === 'male' ? 'Male' : 'Female')}
        ${row('Date of birth', fmtDate(r.dateOfBirth))}
        ${row('Admission', TYPE_LABEL[r.admissionType] ?? r.admissionType)}
        ${row('Previous school', r.previousSchool)}
        ${row('Exam number', r.examNumber)}
      </table>
      <table>
        ${row('Guardian', r.guardian)}
        ${row('Guardian phone', r.guardianPhone)}
        ${row('Sponsor', r.sponsor)}
        ${row('Form teacher', r.formTeacherName)}
        ${row('Date admitted', fmtDate(r.admittedAt))}
        ${row('First day', fmtDate(r.dateOfFirstEntry))}
      </table>
    </div>
    ${r.status === 'cancelled' ? '<div class="cancelled">ADMISSION CANCELLED</div>' : ''}
    <p class="note">Report to the form teacher of <b>${esc(r.className)}</b> with this slip.
      Keep the Student ID: it is used for results, report cards and the Parent Portal.</p>
    <div class="sign">
      <div>Admissions officer: <b>${esc(r.admittedByName)}</b><span class="line"></span>Signature</div>
      <div>Guardian<span class="line"></span>Signature</div>
      <div>School stamp<span class="stamp"></span></div>
    </div>
  </section>`;
}

export function admissionSlipHtml(r: AdmissionRecord, logoUrl = SCHOOL_LOGO_URL): string {
  return `<!doctype html><html><head><meta charset="utf-8" />
<title>Admission slip ${esc(r.admissionNumber)}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; font-size: 11.5px; }
  .slip { height: 135mm; padding: 6mm 4mm; display: flex; flex-direction: column; gap: 3mm; }
  .cut { border-top: 1px dashed #777; margin: 0; position: relative; }
  .cut span { position: absolute; top: -8px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 6px; font-size: 9px; color: #777; }
  header { display: flex; align-items: center; gap: 4mm; border-bottom: 2px solid #111; padding-bottom: 2mm; }
  header img { width: 16mm; height: 16mm; object-fit: contain; }
  header > div:nth-child(2) { flex: 1; }
  .school { font-size: 15px; font-weight: 700; text-transform: uppercase; }
  .title { font-size: 12px; letter-spacing: 1px; margin-top: 1mm; }
  .copy { font-size: 9px; border: 1px solid #111; padding: 1mm 2mm; text-transform: uppercase; }
  .ids { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; }
  .ids div { border: 1.5px solid #111; padding: 2mm; }
  .ids span { display: block; font-size: 9px; text-transform: uppercase; color: #444; }
  .ids b { font-size: 16px; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 1mm 1.5mm; border-bottom: 1px solid #ddd; vertical-align: top; }
  th { width: 34%; font-weight: 600; color: #444; }
  .note { margin: 0; font-size: 10.5px; }
  .cancelled { border: 2px solid #b00; color: #b00; font-weight: 700; text-align: center; padding: 1mm; }
  .sign { display: grid; grid-template-columns: 1.4fr 1fr 0.8fr; gap: 4mm; margin-top: auto; font-size: 10px; }
  .line { display: block; border-bottom: 1px solid #111; height: 9mm; margin-bottom: 1mm; }
  .stamp { display: block; border: 1px dashed #999; height: 14mm; margin-top: 1mm; }
</style></head><body>
${half(r, "Guardian's copy", logoUrl)}
<div class="cut"><span>cut here</span></div>
${half(r, "School's copy", logoUrl)}
</body></html>`;
}

/** Print the slip without leaving the page. */
export function printAdmissionSlip(r: AdmissionRecord): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const docu = iframe.contentDocument!;
  docu.open();
  docu.write(admissionSlipHtml(r, new URL(SCHOOL_LOGO_URL, window.location.origin).href));
  docu.close();
  const go = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60_000);
  };
  // Give the logo a moment to load.
  setTimeout(go, 400);
}
