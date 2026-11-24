# AI server: speed and many teachers at once (21 November 2026)

## Where the time went
- **The model.** `ai-server/.env` used **Nemotron 3 Ultra (550B)**, the largest and slowest model. **Super (120B)** writes the same documents several times faster. The server now prints a warning at start-up while Ultra is set.
- **Thinking.** Nemotron 3 "thinks" before it writes, which can take minutes, and nothing told it how much to think. Now every job has its own level (`config/env.ts`, `JOB_DEFAULTS`):

  | Job | Thinking | Length (tokens) | Model |
  |---|---|---|---|
  | assessment | low | 14000 | main |
  | keyCheck (Maths/Physics answers) | full | 14000 | main |
  | lessonPlan | off | 6000 | main |
  | schemeOfWork | off | 9000 | main |
  | recordOfWork, evaluation, workPlan | off | 4000 / 1200 / 5000 | fast (Nano 30B) |
  | figureRepair | low | 4000 | main |

  The level is sent as `chat_template_kwargs` (`enable_thinking`, `low_effort`). A host that refuses the option is asked again without it, and the option is never sent to that host again. If your key cannot use the fast model, the main model is used instead.
  Override with `AI_EFFORT` and `AI_MAX_TOKENS` in `.env`.
- **Files.** Every request wrote `teachers.json` ("last seen"), one write after another. Now:
  - "last seen" is saved at most every 5 minutes per teacher;
  - saves made at the same time are merged into one (`utils/JsonStore.ts`: 200 saves at once became 1 disk write in a test);
  - a Windows file lock is retried;
  - `usage.json` and the eFile document files are written compact.
- **Search.**
  - The searches for one document run at the same time instead of one after another (`RetrievalService`).
  - The last 500 search embeddings are remembered (`CachedEmbedder`), so a repeat search skips the embedding call.
  - Lesson-plan extracts for the eFile list are worked out once per plan.

## Many teachers at once
- **Queue** (`QueuedWriter` in `services/ai/NemotronProvider.ts`):
  - at most `WRITER_CONCURRENCY` documents are written at once (default 4);
  - other teachers wait in order and see "Many teachers are generating now: you are next / n ahead of you";
  - a teacher who stops their document while waiting leaves the queue.
- **Busy host.** On 429, 5xx or a network error, the same host is asked again twice (after 1.5 s, then 4.5 s), then the next host in `WRITER_HOSTS`.
- **Stalled stream.** A stream that sends nothing for 2 minutes is given up with a clear message, instead of hanging.
- **Heartbeat.** `/generate` sends a `ping` line every 15 s, so phone networks and proxies keep the connection open while the teacher waits, thinks or has the key checked.
- **Health.** `GET /api/health` now shows `writer: { running, waiting, limit }`.

## When NVIDIA retires a model
NVIDIA retires models from time to time (Nemotron 3 Super reached end of life in November 2026), and the requests then fail.
- **A list of models** (`config/env.ts`, `services/ai/NemotronProvider.ts`): `NVIDIA_MODEL` can name several models separated by commas. If the first is retired or not found, the server moves to the next one, logs `switching to …`, and keeps working.
  - Default: `nvidia/nemotron-3.5-super-vl-120b-a12b,nvidia/nemotron-3-super-120b-a12b`.
- **Light jobs**: `NVIDIA_FAST_MODEL` is now `nvidia/nemotron-3.5-lightning-30b-a3b`. If it is not available, the main model is used.
- **Thinking**: Nemotron 3.5 models get `reasoning_effort` (none, low or high); Nemotron 3 models still get `chat_template_kwargs`. If a model refuses either, the request is sent again without it.
- **Clear message** (`utils/errors.ts`): if every model in the list is retired, the teacher sees "the model … has been retired by the provider. Put a current model in NVIDIA_MODEL…".
