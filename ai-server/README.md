# Kalabo AI server

A server of its own for the AI tools: lesson plans, schemes of work,
assessments, records of work and the eFile. It does **not** use Firestore or
Cloud Functions. Everything it saves is in `ai-server/storage/`, and it
writes with **NVIDIA Nemotron** from the curriculum PDFs the superAdmin
uploads (RAG, with ChromaDB as the search index).

The school website keeps working whether this server is running or not; the
AI Tools pages simply say the service is not connected.

## First-time setup

Open a terminal in this folder (`ai-server`):

```
npm install
copy .env.example .env
```

Open `.env` and fill in:

| Setting | What to put |
|---|---|
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD` | Your superAdmin sign-in (password 10+ characters) |
| `NVIDIA_API_KEY` | Your key from https://build.nvidia.com/settings/api-keys (starts with `nvapi-`) |

Then create the superAdmin account. This works **once**:

```
npm run create-superadmin
```

Afterwards delete the password from `.env`; only a hashed copy is kept.
To replace the account later, delete `storage/superadmin.json` and run it again.

## Running

| Terminal | Folder | Command | What starts |
|---|---|---|---|
| 1 | `ai-server` | `npm run dev` | ChromaDB (port 8100) and the AI server (http://localhost:5050) |
| 2 | project root | `pnpm dev` | The school website (http://localhost:8080) |

All status lines printed by terminal 1 should show ✓.

- SuperAdmin console: http://localhost:8080/superadmin
- Teachers: sign in as usual, then **AI Tools** in the sidebar.

## How a document is made (RAG)

**1. Indexing: once per curriculum PDF, when the superAdmin uploads it**

| Step | File | What it does |
|---|---|---|
| Extract | `src/services/rag/PDFProcessor.ts` | PDF → text, page by page |
| Chunk | `src/services/rag/DocumentChunker.ts` | Text → ~1,000-character passages overlapping by 200. Every passage is labelled with the document's **subject, type and every class level it covers** (a Form 1–4 syllabus marks its passages for Form 1, 2, 3 and 4) |
| Embed | `src/services/rag/EmbeddingService.ts` | Each passage → an embedding (NVIDIA, `input_type: passage`) |
| Store | `src/services/rag/VectorStoreService.ts` | Embeddings + labels saved in ChromaDB (`storage/chroma`) |
| Conduct | `src/services/rag/IndexingService.ts` | Runs the four steps one document at a time and records the status the console shows |

**2. Generating: every time a teacher presses Generate**

| Step | File | What it does |
|---|---|---|
| Search | `src/services/rag/RetrievalService.ts` | The tool's search text → embedding (`input_type: query`) → the closest passages **for that subject and class level only** |
| Prompt | `src/services/generation/prompts.ts` | Rules + numbered passages + the tool's layout |
| Write | `src/services/ai/NemotronProvider.ts` | Nemotron writes the document, streamed to the page as it is written |
| Save | `src/services/EFileService.ts` | The finished document, with its sources, goes into the teacher's eFile |
| Conduct | `src/services/generation/GenerationService.ts` | Runs search → prompt → write |

**3. Curriculum maps: the syllabus itself, word for word**

Searching finds good *content*, but the topic, sub-topic, specific
competences and expected standards must be the syllabus's own words every
time. So every PDF uploaded with the type **Syllabus** is also read into a
**curriculum map**: topic → sub-topic → specific competence, with each
competence's learning activities and expected standards.

| Step | File | What it does |
|---|---|---|
| Fix the text | `src/services/rag/textRepair.ts` | The CDC PDFs (made in CorelDRAW) store many words shifted by 29 letters (":HE" for "Web"). Each piece of text is checked and shifted back; also used for indexing |
| Read positions | `src/services/rag/PDFProcessor.ts` (`extractItems`) | Every piece of text with where it sits on the (landscape) page |
| Read the table | `src/services/curriculum/SyllabusParser.ts` | Finds the header row (TOPIC, SUB-TOPIC, SPECIFIC COMPETENCES, LEARNING ACTIVITIES, EXPECTED STANDARD), puts text in its column, and uses the codes (1.1 topic, 1.1.1 sub-topic, 1.1.1.1 competence) to build the tree. The Form is the first digit. Tables that run onto the next page are joined |
| Keep and approve | `src/services/curriculum/CurriculumMapService.ts` | `storage/curriculum-maps.json`. A new map is a **draft**; the superAdmin checks it in **Syllabus maps**, corrects any wording, and approves it. Only approved maps reach teachers |
| Into the prompt | `src/services/generation/syllabusContext.ts` | Puts the chosen sub-topic's (or topics') exact competences, activities and standards into the prompt as an "OFFICIAL SYLLABUS" block, and turns the assessment's sections into exact instructions |

Tested on the ICT syllabus (18 topics, 23 sub-topics, 33 competences) and
the Computer Science syllabus (42 topics, 47 sub-topics, 47 competences),
Forms 1–4, with no warnings. A syllabus in a different layout gives the
message "No syllabus table was found"; it is still indexed for search.

**What teachers get from an approved map**

- **Lesson plan:** Topic and Sub-topic are dropdowns (codes and names from
  the syllabus); the sub-topic's competence and expected standard show
  under them. The plan copies the competence and standard and builds the
  lesson from the syllabus learning activities.
- **Assessment:** a checklist of the Form's topics, then **sections**: for
  each, the question type (multiple choice, short answer, structured, essay,
  show your working, practical), the number of questions and the marks.
  The total is worked out for you; the server checks it again. Every answer
  in the marking key names the competence code it tests.
- **Scheme of work:** optionally tick the topics for the term; the weeks
  follow the syllabus order with the official codes.
- Without an approved map for that subject and Form, the boxes are typed
  as before.
- An ICT teacher uses the ICT map; if there is none, a map of a shared
  subject (Computer Studies, Computer Science). Two syllabi are never
  mixed in one dropdown.

**4. Teaching modules and past papers**

- **Teaching modules** (upload as type "Teacher's guide", with the Form they
  are for). The CDC modules head each part "Sub-Topic 2.1.1: Spreadsheets";
  every passage under such a heading is tagged with that sub-topic
  (`DocumentChunker.ts`). A lesson plan on 2.1.1 searches the passages tagged
  with topic 2.1 first, then everything else for that subject and Form
  (`RetrievalService.ts`). Contents pages are not tagged.
- **Past papers** (type "Past paper"; label them with the subject and the
  level they were written for, e.g. Computer Studies, Form 4 / Grade 12).
  Every assessment also gets up to four past-paper passages from the same
  subject group, **at any level**: they show the model how ECZ words and
  marks questions. The model is told to copy the style, never the questions.
- **ECZ style** (`src/services/generation/eczStyle.ts`): what the 2017, 2020
  and 2024 Computer Studies Paper 1 show: a short Zambian scenario per
  question, command words with fixed mark values (Give/State/Name = 1 per
  point, Explain/Describe = 2, Write/Convert = 2 to 6), "[Total: n marks]",
  and an ECZ-style marking key ("any two of", "accept", "do not accept").
  Edit the wording there to tune it.
- Some past-paper PDFs from websites draw the same text two or three times
  on top of itself and again, hidden, on later pages. `PDFProcessor.ts`
  skips runs of lines it has already read in the same document, so each
  question is indexed once.

The model never sees a whole syllabus, only the passages found for that
request (and, with a map, the exact syllabus entries chosen). The source list under each document is built from the passages'
real labels, never by the model.

**To change a layout** (to match the school's official lesson plan, say),
edit that tool's `instructions` in `src/services/generation/prompts.ts` and
restart the server. Each tool also sets how many passages it reads (`topK`).

## Subjects and class levels

- **Upload:** the superAdmin picks the subject from the school's subject list
  (the same standard names Results Entry uses, e.g. "ICT" for Computer
  Studies) and the levels the document covers: **From** and **To**. One form:
  choose the same level twice. A whole syllabus: Form 1 to Form 4.
- **Teachers** pick one of **their own classes** and a subject they teach in
  it, read from Firebase exactly like Results Entry (`useTeacherClasses`).
  The level comes from the class name ("Form 3A" → Form 3). Subjects with
  no curriculum at that level are shown but cannot be chosen.
- The two sides meet on subject name + level, compared without caring about
  case, spaces or "&"/"and". A document labelled with a subject name the
  school does not use will never be found: edit its subject in the library.
- **Shared subjects:** ICT, Computer Studies and Computer Science use each
  other's material (an ICT teacher's lesson plan can draw on a Computer
  Studies syllabus). The groups are in `src/services/rag/subjectGroups.ts`;
  add another line there to group other subjects, then restart. No
  re-indexing is needed.
- Documents uploaded before ranges existed are moved to the new labels and
  indexed again automatically when the server starts.

## Teaching modules

CDC teaching modules (for example the Computer Science Teaching Module –
Form 2) are uploaded as **Teacher's guide / teaching module**. After indexing
they are also read into a structured guide (`src/services/curriculum/ModuleParser.ts`):
each sub-topic's numbered learning activities with their environment,
materials, methods, "How to Conduct" steps and content tips, the topic's
hook, key terms and general competences, the CBC assessment examples with
their rubrics, and which term each topic is taught in. The lesson plan,
scheme of work and assessment prompts follow them (`src/services/generation/moduleContext.ts`),
and a module stands in for a syllabus map when a subject has no approved map.
Full explanation: `AI_TEACHING_MODULES.md` in the project folder.

Check what is read from a module without uploading it:

```
npm run read-module -- "C:\path\to\module.pdf"
```

## Controls the superAdmin has

| Control | Where | Effect |
|---|---|---|
| Tool on/off | AI features | A tool that is off shows "Coming soon" and cannot be used |
| Daily limit | AI features | Most documents per teacher per day (default 20; 0 = no limit). Each document is a paid NVIDIA call |
| Access | Access | Only teachers you grant, or every teacher except those you withdraw |
| Curriculum | Curriculum library | Upload, edit subject/levels/type (re-indexes), re-index, remove |
| Syllabus maps | Syllabus & modules | Check the topics read from each syllabus, correct wording, approve (or back to draft), read the PDF again |
| Teaching modules | Syllabus & modules | See what was read from each teaching module, switch one off, read it again |
| Usage | Usage | Documents generated per tool and per teacher |

## Where everything is

```
ai-server/
├── .env                      Your settings and NVIDIA key (never committed)
├── scripts/
│   ├── create-superadmin.ts  One-time account creation
│   ├── read-module.ts        Shows what is read from a teaching module PDF
│   └── start-chroma.mjs      Starts ChromaDB (from Company Knowledge AI)
├── storage/                  Everything the server saves (never committed)
│   ├── superadmin.json       The superAdmin account (hashed password)
│   ├── settings.json         Tools on/off, access mode, daily limit
│   ├── teachers.json         Teachers seen, and who has access
│   ├── curriculum.json       The curriculum library list and indexing status
│   ├── curriculum/           The curriculum PDFs, named by ID
│   ├── curriculum-maps.json  Topics/competences read from each syllabus (draft or approved)
│   ├── teaching-modules.json Activities, methods, rubrics read from each teaching module
│   ├── chroma/               ChromaDB's search index
│   ├── efile/<uid>.json      Each teacher's eFile (lesson plans keep their evaluation here too)
│   └── usage.json            Who opened or generated what, and when
└── src/
    ├── index.ts              Starts the server
    ├── app.ts                Assembles Express: CORS, routes, errors
    ├── container.ts          Creates all services and connects them
    ├── types.ts              Data shapes (read this first)
    ├── config/env.ts         Reads .env
    ├── middleware/auth.ts    requireSuperAdmin / requireTeacher
    ├── routes/superadmin.ts  Console: login, settings, access, curriculum
    ├── routes/teacher.ts     AI Tools: session, generate, eFile
    └── services/
        ├── rag/              Indexing and search (table above)
        ├── ai/               Nemotron
        ├── curriculum/       Syllabus reader and curriculum maps; teaching-module reader and guides
        ├── generation/       Prompts, the syllabus and teaching-module blocks, the generation conductor
        └── ...               Accounts, settings, access, library, eFile, usage
```

The school app's side:

| File | What it is |
|---|---|
| `client/services/aiApi.ts` | Every call to this server |
| `client/pages/teacher/ai/` | AI Tools home, the generator, eFile, one document |
| `client/components/ai/DocumentPaper.tsx` | A document on school letterhead; Print / PDF and Word (with the logo) |
| `client/components/ai/ui.tsx` | Shared cards, fields, chips, pills used by every AI screen |
| `client/components/ai/aiFeatures.ts` | The tools: names, colours, form boxes |
| `client/components/ai/CurriculumFields.tsx` | Topic/sub-topic dropdowns, topic checklist, assessment sections, module activity checklist, Lesson n of N, rubric size |
| `client/components/ai/LessonEvaluationDialog.tsx` | After the lesson: quick questions → the written Lesson Evaluation |
| `client/hooks/useClassCurriculum.ts` | The approved syllabus topics for the chosen class |
| `client/components/superadmin/SyllabusTab.tsx` | Syllabus maps: review, correct, approve; teaching modules list |
| `client/components/ai/brand.ts` | School name, motto, crest colours |
| `client/hooks/useClassLearnerCounts.ts` | Boys / girls / total for a class, from Firestore |
| `client/pages/superadmin/`, `client/components/superadmin/` | The superAdmin app |

**Documents:** the AI writes only the body. The letterhead (crest, school
name, motto), the title and the details strip (subject, class, teacher,
term, learners: boys / girls / total) are printed by the school app from the
teacher's real data, so they are always correct and always look the same.

## Sign-in

| Who | How they prove who they are | Checked in |
|---|---|---|
| SuperAdmin | Email + password of the account above | `src/services/SuperAdminService.ts` |
| Teacher | The token Google gave their browser at school sign-in | `src/services/TeacherVerifier.ts` |

The teacher check only verifies Google's signature. It reads no Firebase
data and needs no service account or Blaze plan.

## Limits to know

- **Scanned PDFs** (pictures of pages) cannot be indexed yet; they show
  "Failed" with a message. Upload a typed copy.
- **Changing `NVIDIA_EMBEDDING_MODEL`**: use *Re-index all* in the console,
  or searches fail (old and new embeddings are different sizes).
- Documents are written by AI from the passages found. Teachers should check
  them before use; the page says so under every document.

## Putting it online later

Set `CLIENT_ORIGIN` here to the website's address, and `VITE_AI_API_URL` in
the website's build to this server's address. Until `VITE_AI_API_URL` is set,
the live website shows no AI Tools menu at all.
