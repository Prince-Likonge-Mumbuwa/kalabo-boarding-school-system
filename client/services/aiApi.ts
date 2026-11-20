// @/services/aiApi.ts — every call the school app makes to the AI server
// (the ai-server/ folder). Nothing here touches Firestore.
//
// Two kinds of caller:
//   - a teacher: sends the token from their normal school sign-in;
//   - the superAdmin: signs in to the AI server itself and sends that
//     session token (kept in sessionStorage, so it ends with the browser tab).
import type {
  AccessState, AiSettings, AiTeacher, ClassCurriculum, CurriculumDocument, CurriculumMap, DocType, EFileDocument,
  EFileEntry, EFileMeta, EFileScan, EFileSectionId, EFileSummary, FeatureKey, FigureDetails, GeneratorKey, LessonEvaluationAnswers, LibraryFigure, MapTopic, PictureSuggestion, Source, SuperAdminOverview, TeacherAiSession,
} from '@/types/ai';
import type { LibraryPicture } from '@/components/ai/figures/render/image';

// Where the AI server lives. While developing it is your own PC. On the live
// site nothing is assumed: until VITE_AI_API_URL is set, the AI pages are hidden.
const BASE: string =
  ((import.meta.env.VITE_AI_API_URL as string | undefined) ?? '').replace(/\/+$/, '') ||
  (import.meta.env.DEV ? 'http://localhost:5050' : '');

/** False on a site that has not been told where the AI server is. */
export const aiConfigured = BASE !== '';

export class AiApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

async function call<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
  } catch {
    throw new AiApiError('The AI service is not reachable right now.', 0, 'unreachable');
  }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new AiApiError(body?.error?.message ?? `The AI service answered with an error (${response.status}).`, response.status, body?.error?.code ?? 'error');
  return body as T;
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

// ---------------------------------------------------------------- teacher

// Firebase is loaded on first use, the same way as in @/lib/authHeaders, and
// only once: calls that start together share the same load.
let firebase: Promise<typeof import('@/lib/firebase')> | null = null;
async function teacherToken(): Promise<string | null> {
  firebase ??= import('@/lib/firebase');
  const { auth } = await firebase;
  return (await auth.currentUser?.getIdToken()) ?? null;
}

export interface GenerateHandlers {
  /** The curriculum search finished: the document's title and the passages it will use. */
  onMeta?: (meta: { title: string; sources: Source[]; model: string }) => void;
  /** A piece of the document as Nemotron writes it. */
  onText?: (text: string) => void;
  /** After writing: what the server is doing (e.g. "Checking diagrams…"). */
  onStatus?: (message: string) => void;
  /** Something to keep on screen beside the document (e.g. the curriculum search was down). */
  onNotice?: (message: string) => void;
}

/** Blob -> data: URL. */
const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export const teacherAi = {
  /** "I have opened AI Tools": which tools are on, and may I use them? */
  session: async (name: string) =>
    call<TeacherAiSession>('/teacher/session', await teacherToken(), json('POST', { name })),
  /** Tells the AI server a tool was opened (for the superAdmin's usage view). */
  opened: async (feature: FeatureKey) =>
    call<void>('/teacher/usage', await teacherToken(), json('POST', { feature })),

  /**
   * Writes a document. The server replies with one JSON object per line
   * (meta, then many text pieces, then done or error), read here as it arrives.
   * Resolves with the document saved to the eFile. `signal` is the Stop button.
   */
  generate: async (feature: GeneratorKey, inputs: Record<string, string>, handlers: GenerateHandlers, signal?: AbortSignal): Promise<EFileDocument> => {
    let response: Response;
    try {
      response = await fetch(`${BASE}/api/teacher/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await teacherToken()) ?? ''}` },
        body: JSON.stringify({ feature, inputs }),
        signal,
      });
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') throw err;
      throw new AiApiError('The AI service is not reachable right now.', 0, 'unreachable');
    }
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => null);
      throw new AiApiError(body?.error?.message ?? `The AI service answered with an error (${response.status}).`, response.status, body?.error?.code ?? 'error');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === 'meta') handlers.onMeta?.(event);
        else if (event.type === 'text') handlers.onText?.(event.text);
        else if (event.type === 'status') handlers.onStatus?.(event.message);
        else if (event.type === 'notice') handlers.onNotice?.(event.message);
        else if (event.type === 'done') return event.document as EFileDocument;
        else if (event.type === 'error') throw new AiApiError(event.message, 0, event.code);
      }
      if (done) break;
    }
    throw new AiApiError('The connection to the AI service was cut before the document was finished.', 0, 'incomplete');
  },

  /** The topics and sub-topics for one class, from an approved syllabus map or a teaching module (null when neither exists). */
  curriculumMap: async (subject: string, level: string) =>
    (await call<{ map: ClassCurriculum | null }>(
      `/teacher/curriculum-map?subject=${encodeURIComponent(subject)}&level=${encodeURIComponent(level)}`,
      await teacherToken(),
    )).map,

  efileList: async () => (await call<{ documents: EFileSummary[] }>('/teacher/efile', await teacherToken())).documents,
  efileGet: async (id: string) => call<EFileDocument>(`/teacher/efile/${encodeURIComponent(id)}`, await teacherToken()),
  efileDelete: async (id: string) => call<void>(`/teacher/efile/${encodeURIComponent(id)}`, await teacherToken(), { method: 'DELETE' }),

  // ── The rest of the Teacher's File: personal record and the teacher's own entries ──
  efileMeta: async () => call<EFileMeta>('/teacher/efile-file', await teacherToken()),
  efileSaveProfile: async (profile: Record<string, string>) =>
    (await call<{ profile: Record<string, string> }>('/teacher/efile-file/profile', await teacherToken(), json('PUT', { profile }))).profile,
  efileAddEntry: async (entry: { section: EFileSectionId; title: string; content: string; date?: string }) =>
    call<EFileEntry>('/teacher/efile-file/entries', await teacherToken(), json('POST', entry)),
  efileUpdateEntry: async (id: string, change: Partial<{ section: EFileSectionId; title: string; content: string; date: string }>) =>
    call<EFileEntry>(`/teacher/efile-file/entries/${encodeURIComponent(id)}`, await teacherToken(), json('PUT', change)),
  efileDeleteEntry: async (id: string) =>
    call<void>(`/teacher/efile-file/entries/${encodeURIComponent(id)}`, await teacherToken(), { method: 'DELETE' }),

  // ── Scanned papers: marked scripts (highest, average, lowest) and own question papers ──
  /** `pages` are the cleaned JPEGs from the camera (see components/ai/ScanCapture). */
  efileAddScan: async (details: Omit<EFileScan, 'id' | 'pages' | 'createdAt'>, pages: Blob[]) => {
    const form = new FormData();
    pages.forEach((p, n) => form.append('pages', p, `page-${n + 1}.jpg`));
    form.append('details', JSON.stringify(details));
    return call<EFileScan>('/teacher/efile-file/scans', await teacherToken(), { method: 'POST', body: form });
  },
  /** One scanned page (needs the teacher's sign-in, so it is fetched, not an <img src>). */
  efileScanPage: async (id: string, page: number): Promise<Blob> => {
    const response = await fetch(`${BASE}/api/teacher/efile-file/scans/${encodeURIComponent(id)}/pages/${page}`, { headers: { Authorization: `Bearer ${(await teacherToken()) ?? ''}` } });
    if (!response.ok) throw new AiApiError('The scanned page could not be loaded.', response.status, 'scan');
    return response.blob();
  },
  efileDeleteScan: async (id: string) =>
    call<void>(`/teacher/efile-file/scans/${encodeURIComponent(id)}`, await teacherToken(), { method: 'DELETE' }),

  /** After the lesson: the teacher's answers -> an evaluation statement written by the AI (nothing is saved yet). */
  evaluationDraft: async (id: string, answers: LessonEvaluationAnswers) =>
    (await call<{ statement: string }>(`/teacher/efile/${encodeURIComponent(id)}/evaluation/draft`, await teacherToken(), json('POST', { answers }))).statement,
  /** Saves the (edited) statement into the lesson plan's Lesson Evaluation section. */
  evaluationSave: async (id: string, answers: LessonEvaluationAnswers, statement: string) =>
    call<EFileDocument>(`/teacher/efile/${encodeURIComponent(id)}/evaluation`, await teacherToken(), json('PUT', { answers, statement })),

  // ── Diagram library ──
  figures: async (filter: { subject?: string; level?: string } = {}) => {
    const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as [string, string][]).toString();
    return (await call<{ figures: LibraryFigure[] }>(`/teacher/figures${q ? `?${q}` : ''}`, await teacherToken())).figures;
  },
  /** Uploads a picture; the server crops (crop = fractions of the picture), cleans and saves it. */
  figureUpload: async (file: Blob, details: FigureDetails, options: { crop?: { x: number; y: number; w: number; h: number }; threshold?: boolean } = {}) => {
    const form = new FormData();
    form.append('image', file, 'diagram');
    form.append('details', JSON.stringify({ details, ...options }));
    return call<LibraryFigure>('/teacher/figures', await teacherToken(), { method: 'POST', body: form });
  },
  figureUpdate: async (id: string, details: Partial<FigureDetails>) =>
    call<LibraryFigure>(`/teacher/figures/${encodeURIComponent(id)}`, await teacherToken(), json('PUT', details)),
  figureDelete: async (id: string) => call<void>(`/teacher/figures/${encodeURIComponent(id)}`, await teacherToken(), { method: 'DELETE' }),
  figureSuggest: async (id: string) => call<PictureSuggestion>(`/teacher/figures/${encodeURIComponent(id)}/suggest`, await teacherToken(), { method: 'POST' }),
  /** The cleaned picture as a blob (it needs the teacher's sign-in, so it cannot be a plain <img src>). */
  figureImage: async (id: string): Promise<Blob> => {
    const response = await fetch(`${BASE}/api/teacher/figures/${encodeURIComponent(id)}/image`, { headers: { Authorization: `Bearer ${(await teacherToken()) ?? ''}` } });
    if (!response.ok) throw new AiApiError('The picture could not be loaded.', response.status, 'image');
    return response.blob();
  },
  /** A library picture ready to draw inside a document (null if it is gone or not shared with this teacher). */
  figurePicture: async (id: string): Promise<LibraryPicture | null> => {
    try {
      const token = await teacherToken();
      const [meta, blob] = await Promise.all([
        call<LibraryFigure>(`/teacher/figures/${encodeURIComponent(id)}`, token),
        teacherAi.figureImage(id),
      ]);
      return { dataUrl: await toDataUrl(blob), width: meta.width, height: meta.height, labels: meta.labels };
    } catch {
      return null;
    }
  },
};

// ------------------------------------------------------------- superAdmin

const TOKEN_KEY = 'kalabo.superadmin.token';

function readToken(): string | null {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export const superAdminSession = {
  isSignedIn: () => readToken() !== null,
  signOut: () => { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* nothing to clear */ } },
};

export const superAdminApi = {
  login: async (email: string, password: string) => {
    const { token } = await call<{ token: string; expiresAt: string }>('/superadmin/login', null, json('POST', { email, password }));
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { throw new AiApiError('This browser blocked saving the session.', 0, 'storage_blocked'); }
  },
  overview: () => call<SuperAdminOverview>('/superadmin/overview', readToken()),
  updateSettings: (patch: { features?: Partial<Record<FeatureKey, boolean>>; accessMode?: AiSettings['accessMode']; dailyLimit?: number }) =>
    call<AiSettings>('/superadmin/settings', readToken(), json('PUT', patch)),
  setAccess: (uid: string, access: AccessState) =>
    call<AiTeacher>(`/superadmin/teachers/${encodeURIComponent(uid)}`, readToken(), json('PUT', { access })),
  uploadCurriculum: (files: File[], labels: { subject: string; levels: string[]; docType: DocType }) => {
    const form = new FormData();
    form.append('subject', labels.subject);
    // A file upload can only carry text, so the list of levels travels as JSON text.
    form.append('levels', JSON.stringify(labels.levels));
    form.append('docType', labels.docType);
    files.forEach((file) => form.append('files', file));
    return call<{ accepted: CurriculumDocument[]; rejected: { name: string; reason: string }[] }>(
      '/superadmin/curriculum', readToken(), { method: 'POST', body: form });
  },
  deleteCurriculum: (id: string) => call<void>(`/superadmin/curriculum/${id}`, readToken(), { method: 'DELETE' }),
  /** Correct a document's subject, levels or type; the AI server indexes it again. */
  relabelCurriculum: (id: string, labels: { subject?: string; levels?: string[]; docType?: DocType }) =>
    call<CurriculumDocument>(`/superadmin/curriculum/${id}`, readToken(), json('PATCH', labels)),
  reindexCurriculum: (id: string) => call<CurriculumDocument>(`/superadmin/curriculum/${id}/reindex`, readToken(), { method: 'POST' }),
  reindexAll: () => call<{ queued: number }>('/superadmin/curriculum/reindex-all', readToken(), { method: 'POST' }),
  /** Reads a syllabus document into a draft curriculum map (replaces its old map). */
  readSyllabusMap: (documentId: string) =>
    call<CurriculumMap>(`/superadmin/curriculum/${documentId}/map`, readToken(), { method: 'POST' }),
  getMap: (id: string) => call<CurriculumMap>(`/superadmin/maps/${id}`, readToken()),
  saveMap: (id: string, topics: MapTopic[]) => call<CurriculumMap>(`/superadmin/maps/${id}`, readToken(), json('PUT', { topics })),
  approveMap: (id: string, approved: boolean) =>
    call<CurriculumMap>(`/superadmin/maps/${id}/approve`, readToken(), json('POST', { approved })),
  deleteMap: (id: string) => call<void>(`/superadmin/maps/${id}`, readToken(), { method: 'DELETE' }),
  /** Reads a document as a CDC teaching module again (it is also read automatically when indexed). */
  readTeachingModule: (documentId: string) => call<unknown>(`/superadmin/curriculum/${documentId}/module`, readToken(), { method: 'POST' }),
  setModuleActive: (id: string, active: boolean) => call<unknown>(`/superadmin/modules/${id}/active`, readToken(), json('PUT', { active })),

  /** Downloads the PDF (the request needs the session token, so a plain link would not work) and opens it. */
  openCurriculum: async (id: string) => {
    const response = await fetch(`${BASE}/api/superadmin/curriculum/${id}/file`, {
      headers: { Authorization: `Bearer ${readToken() ?? ''}` },
    }).catch(() => null);
    if (!response?.ok) throw new AiApiError('Could not open the document.', response?.status ?? 0, 'open_failed');
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
