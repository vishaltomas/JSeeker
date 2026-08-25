// Stub of the app's contextBridge API, backed by invented demo data, so the
// screenshot run never touches the real store.json or a real model.
const { contextBridge } = require("electron");

const RESB = `macro:(
    Name: Cell(fw : 700, fs : 30, ta : 'Center', ps : 0),
    Contact: Cell(fs : 12, ta : 'Center', ps : 0, mt : 6),
    Summary: Cell(fs : 12, ps : 0, mt : 12),
    Heading: Cell(fw : 700, fs : 15, ps : 0, mt : 14, mb : 5, rule : 1),
    Role: Block(spread : 'Between', gap : 16, mt : 8,
        Cell(fs : 13, ps : 0, grow : 1),
        Cell(fs : 13, ps : 0, nowrap : 1)
    ),
    Points: Block(dir : 'Column', gap : 2, mt : 3,
        Cell(fs : 12, ps : 0, bullet : 1)
    ),
    Line: Cell(fs : 12, ps : 0, mt : 4)
)
main:(
    Name: 'Alex Morgan',
    Contact: 'Kuala Lumpur, MY | alex.morgan@example.com | github.com/alexmorgan',

    Summary: 'Frontend engineer with four years on design systems and desktop apps, looking for product work where the interface is the product.',

    Heading: 'Experience',
    Role: '**Frontend Engineer**, Northwind Labs — Kuala Lumpur' | 'Mar 2022 – Present',
    Points: 'Rebuilt the component library used by six product teams, cutting page build times in half.'
        | 'Shipped the offline-first editor now used by 40k monthly users.'
        | 'Mentored two juniors through their first production releases.',

    Role: '**Junior Developer**, Pilcrow Studio — Remote' | 'Jan 2021 – Feb 2022',
    Points: 'Built the client dashboard that became the studio default template.'
        | 'Automated the release checklist, removing a half-day of manual work per sprint.',

    Heading: 'Education',
    Role: '**Universiti Malaya**, BSc Computer Science' | '2017 – 2021',

    Heading: 'Skills',
    Line: '**Languages:** TypeScript, Python, SQL',
    Line: '**Tools:** React, Electron, Vite, Tailwind, Postgres'
)
`;

const now = Date.now();
const hour = 3600 * 1000;

const STORE = {
  data: {
    firstName: "Alex",
    lastName: "Morgan",
    email: "alex.morgan@example.com",
    phone: "+60 12-345 6789",
    location: "Kuala Lumpur, Malaysia",
    github: "github.com/alexmorgan",
    linkedin: "linkedin.com/in/alexmorgan",
    "Notice period": "30 days",
    "Work authorization": "Malaysian citizen, no sponsorship needed",
  },
  resume: {
    summary:
      "Frontend engineer with four years on design systems and desktop apps, looking for product work where the interface is the product.",
    experience: [
      {
        id: "e1",
        title: "Frontend Engineer",
        company: "Northwind Labs",
        startDate: "Mar 2022",
        endDate: "Present",
        bullets: [
          "Rebuilt the component library used by six product teams, cutting page build times in half.",
          "Shipped the offline-first editor now used by 40k monthly users.",
          "Mentored two juniors through their first production releases.",
        ],
      },
      {
        id: "e2",
        title: "Junior Developer",
        company: "Pilcrow Studio",
        startDate: "Jan 2021",
        endDate: "Feb 2022",
        bullets: [
          "Built the client dashboard that became the studio default template.",
          "Automated the release checklist, removing a half-day of manual work per sprint.",
        ],
      },
    ],
    education: [
      {
        id: "d1",
        school: "Universiti Malaya",
        degree: "BSc",
        field: "Computer Science",
        startDate: "2017",
        endDate: "2021",
      },
    ],
    skills: ["TypeScript", "React", "Electron", "Vite", "Tailwind", "Python", "SQL", "Postgres"],
    languages: [
      { id: "l1", name: "English", proficiency: "Native" },
      { id: "l2", name: "Malay", proficiency: "Fluent" },
    ],
  },
  resumeFiles: ["/home/alex/Documents/alex-morgan-resume.pdf"],
  settings: {
    provider: "ollama",
    ollamaModel: "qwen2.5:3b",
    ollamaHost: "http://127.0.0.1:11434",
    anthropicApiKey: "",
    anthropicModel: "claude-opus-4-8",
    extensionSyncToken: "0f3c8a91d4b27e65",
  },
  onboarded: true,
  builderFilePath: "/workspace/alex-morgan.resb",
  builderAutosave: true,
  builderAutoCompile: true,
  builderChatOpen: true,
  builderFont: "inter",
  builderAccent: "violet",
};

const REPLY =
  "Yes — your Northwind work lines up with most of it. They want a design-system background and someone comfortable owning a desktop client, and that is two of your three most recent projects.\n\nThe gap is React Native: the posting lists it first. I would lead the cover letter with the offline-first editor, which is the closest thing you have to shipping on a constrained client.";

let onDelta = null;
let onDone = null;

contextBridge.exposeInMainWorld("api", {
  versions: { node: "20", chrome: "126", electron: "31" },
  loadStore: () => Promise.resolve(STORE),
  saveStore: () => Promise.resolve(true),
  pickResumeFiles: () => Promise.resolve([]),
  parseResume: () => Promise.resolve({ fields: {}, resume: STORE.resume, unsupportedFiles: [] }),
  mergeProfile: () => Promise.resolve({ fields: STORE.data, resume: STORE.resume, report: {} }),
  onResumeProgress: () => {},
  builder: {
    list: () =>
      Promise.resolve({
        dir: "/workspace",
        files: [
          { name: "alex-morgan.resb", path: "/workspace/alex-morgan.resb", modified: now },
          { name: "northwind-tailored.resb", path: "/workspace/northwind-tailored.resb", modified: now - hour },
        ],
      }),
    read: () => Promise.resolve({ content: RESB }),
    write: () => Promise.resolve({ ok: true }),
    create: () => Promise.resolve({ error: "demo" }),
    rename: () => Promise.resolve({ error: "demo" }),
    remove: () => Promise.resolve({ ok: true }),
    pick: () => Promise.resolve({ canceled: true }),
  },
  exportPdf: () => Promise.resolve({ ok: true, filePath: "/home/alex/alex-morgan.pdf" }),
  extensionInfo: () => Promise.resolve({ port: 43117, listening: true }),
  openExternal: () => Promise.resolve(true),
  onOllamaStatus: () => {},
  getOllamaStatus: () => Promise.resolve({ state: "ready", model: "qwen2.5:3b" }),
  startOllama: () => Promise.resolve(),
  chat: {
    // Streams the canned reply a few characters at a time, the same shape the
    // real provider deltas arrive in.
    send: () => {
      let i = 0;
      const tick = setInterval(() => {
        if (i >= REPLY.length) {
          clearInterval(tick);
          onDone && onDone(REPLY);
          return;
        }
        const next = REPLY.slice(i, i + 7);
        i += 7;
        onDelta && onDelta(next);
      }, 8);
    },
    onDelta: (cb) => {
      onDelta = cb;
    },
    onDone: (cb) => {
      onDone = cb;
    },
    onError: () => {},
    onTool: () => {},
  },
});
