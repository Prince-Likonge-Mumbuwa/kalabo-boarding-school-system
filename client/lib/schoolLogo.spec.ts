// @vitest-environment node
// Every downloaded document gets the logo: it comes with the app, and a web
// page sent back instead of the picture is never used.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const png = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../assets/school-logo.png')));
const html = new TextEncoder().encode('<!doctype html><html><body>app</body></html>');
const reply = (bytes: Uint8Array, status = 200) =>
  ({ ok: status === 200, status, arrayBuffer: async () => bytes.slice().buffer }) as unknown as Response;

beforeEach(() => vi.resetModules());

describe('school logo', () => {
  it('loads the copy bundled with the app and puts it in a PDF', async () => {
    const fetchMock = vi.fn(async () => reply(png));
    vi.stubGlobal('fetch', fetchMock);
    const { embedSchoolLogo, SCHOOL_LOGO_URL } = await import('./schoolLogo');
    const doc = await PDFDocument.create();
    const img = await embedSchoolLogo(doc);
    expect(img).not.toBeNull();
    expect(img!.width).toBe(500);
    expect(fetchMock.mock.calls[0][0]).toBe(SCHOOL_LOGO_URL);
    // Downloaded once, reused for the next document.
    await embedSchoolLogo(await PDFDocument.create());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a web page sent instead of the picture and falls back to /images', async () => {
    const fetchMock = vi.fn(async (url: string) => (url === '/images/school-logo.png' ? reply(png) : reply(html)));
    vi.stubGlobal('fetch', fetchMock);
    const { embedSchoolLogo } = await import('./schoolLogo');
    expect(await embedSchoolLogo(await PDFDocument.create())).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no picture anywhere: the document is still made, without a logo, and the next one tries again', async () => {
    const fetchMock = vi.fn(async () => reply(html));
    vi.stubGlobal('fetch', fetchMock);
    const { embedSchoolLogo } = await import('./schoolLogo');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await embedSchoolLogo(await PDFDocument.create())).toBeNull();
    await new Promise(r => setTimeout(r, 0));
    fetchMock.mockImplementation(async () => reply(png));
    expect(await embedSchoolLogo(await PDFDocument.create())).not.toBeNull();
  });
});
