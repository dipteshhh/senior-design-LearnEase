# LearnEase System Architecture

This diagram reflects the current implementation in this repository: a Next.js frontend, an Express backend, local encrypted artifact storage, SQLite metadata/cached outputs, Google-based authentication, OpenAI-backed processing, and an in-process reminder scheduler.

## Corrected V2 Topology

```mermaid
flowchart LR
    browser["Student Browser"]
    gis["Google Identity Services<br/>client-side sign-in"]
    tokeninfo["Google Token Info API<br/>verifies ID token"]
    openai["OpenAI API"]
    emailapi["Resend Email API"]

    subgraph frontend["Frontend Service<br/>Next.js App Router on Railway"]
        pages["UI Pages<br/>Landing, Sign In, Dashboard,<br/>Upload, Documents, Focus, Quiz, Settings"]
        clientauth["Client Session Layer<br/>AuthProvider + session restore"]
        proxy["Same-Origin API Proxy<br/>/api/* + /api/backend-health"]
    end

    subgraph backend["Backend Service<br/>Express on Railway<br/>single replica"]
        edge["HTTP Boundary<br/>CORS, security headers,<br/>request logging, rate limiting,<br/>cookie auth, multer"]
        authroute["Auth + Session Routes<br/>/api/auth/google, /me, /logout"]
        docroutes["Document API Routes<br/>upload, documents, study guide,<br/>quiz, checklist, due date, reminders"]
        ingest["Upload / Ingestion Pipeline<br/>signature validation, PDF/DOCX extraction,<br/>text normalization, local detection, dedupe"]
        sgjob["Study Guide Worker<br/>LLM pre-classification + generation<br/>plus contract validation"]
        quizjob["Quiz Worker<br/>lecture-only generation<br/>plus contract validation"]
        scheduler["Reminder Scheduler<br/>startup recovery + 15 minute scan"]
        repo["Repository Layer<br/>SQLite + encrypted artifact access"]
    end

    subgraph volume["Backend Persistent Volume"]
        sqlite["SQLite<br/>users, documents, cached JSON,<br/>checklist, reminder state"]
        files["Encrypted Artifacts on Disk<br/>AES-256-GCM original files + extracted text"]
    end

    browser --> pages
    browser <-->|"Google sign-in"| gis
    pages --> clientauth
    clientauth -->|"same-origin /api/* with cookies"| proxy
    pages -.->|"poll status until ready"| proxy
    proxy -->|"server-to-server proxy"| edge

    edge --> authroute
    edge --> docroutes
    docroutes --> ingest
    docroutes --> sgjob
    docroutes --> quizjob
    authroute --> repo
    ingest --> repo
    sgjob --> repo
    quizjob --> repo
    scheduler --> repo

    authroute -->|"verify Google credential"| tokeninfo
    sgjob -->|"classify + generate"| openai
    quizjob -->|"generate quiz"| openai
    scheduler -->|"send due-soon reminders"| emailapi

    repo <--> sqlite
    repo <--> files

    classDef frontend fill:#eaf4ff,stroke:#2563eb,color:#0f172a,stroke-width:1.5px;
    classDef backend fill:#eefbf3,stroke:#15803d,color:#0f172a,stroke-width:1.5px;
    classDef data fill:#fff7e8,stroke:#b45309,color:#0f172a,stroke-width:1.5px;
    classDef ext fill:#f8fafc,stroke:#475569,color:#0f172a,stroke-width:1.5px;

    class pages,clientauth,proxy frontend;
    class edge,authroute,docroutes,ingest,sgjob,quizjob,scheduler,repo backend;
    class sqlite,files data;
    class browser,gis,tokeninfo,openai,emailapi ext;
```

## Processing Lifecycle

```mermaid
flowchart TD
    a["1. User uploads PDF or DOCX"] --> b["2. Next.js /api proxy forwards the request to Express with the session cookie"]
    b --> c["3. Backend validates file signature and extracts text<br/>PDF via pdf-parse, DOCX via mammoth"]
    c --> d["4. Backend normalizes text, performs deterministic type detection,<br/>checks duplicate content hash, and persists the upload"]
    d --> e["5. Metadata and cached JSON live in SQLite;<br/>original file and extracted text are encrypted on the backend volume"]
    e --> f["6. User explicitly clicks Create Study Guide or Create Quiz"]
    f --> g["7. Backend immediately marks the selected flow as processing<br/>and returns status to the frontend"]
    g --> h{"8. Which async flow starts?"}
    h --> i["Study Guide worker<br/>LLM re-classifies document type, then generates output"]
    h --> j["Quiz worker<br/>lecture-only generation, no separate pre-classification step"]
    i --> k["9. Validate schema, supporting quotes, citations,<br/>and academic-integrity constraints"]
    j --> l["10. Validate quiz schema, supporting quotes, and citations"]
    k --> m["11. Persist ready or failed state plus generated JSON"]
    l --> m
    m --> n["12. Frontend polls document and result endpoints until the flow is ready"]
    m --> o["13. Homework due date, due time, and opt-in state feed the reminder scheduler"]
    o --> p["14. Scheduler sends one due-soon email inside the 24 hour window"]
```

## Architecture Notes

- The browser talks to the frontend origin only. The Next.js API layer proxies backend calls so session cookies remain first-party.
- The backend is intentionally stateful. SQLite, encrypted local artifacts, crash recovery, and reminder scheduling all assume one replica with a persistent volume.
- Upload is synchronous only through extraction and initial classification. Study-guide and quiz generation are asynchronous in-process jobs with persisted status for polling.
- Study-guide generation uses a two-stage classification model: deterministic local detection at upload time, then LLM classification before generation. Quiz generation does not use that extra pre-classification step.
- Google token verification is part of the auth route only. It is not a generic call made by all backend requests.
- AI output is never trusted directly. The backend validates schema shape, citation grounding, verbatim quote presence, and academic-integrity rules before saving results.
- The persistent boundary is split by data type: SQLite stores metadata and cached JSON; encrypted disk artifacts store the original upload and extracted text on the backend volume.

## Read This With The Diagram

- [docs/API.md](/Users/diptesh/Projects/senior-design-LearnEase/docs/API.md)
- [docs/AUTH.md](/Users/diptesh/Projects/senior-design-LearnEase/docs/AUTH.md)
- [docs/DB_SCHEMA.md](/Users/diptesh/Projects/senior-design-LearnEase/docs/DB_SCHEMA.md)
- [docs/DEPLOY_RAILWAY.md](/Users/diptesh/Projects/senior-design-LearnEase/docs/DEPLOY_RAILWAY.md)
