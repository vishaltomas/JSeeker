/**
 * Skills — instruction blocks handed to a model before it is asked to do
 * something the base prompt doesn't teach.
 *
 * `.resb` is a language of this project's own (see resume_builder/), so a
 * model has no prior knowledge of it whatsoever: without being taught the
 * grammar it writes LaTeX, or Markdown, or a plausible-looking dialect that
 * doesn't parse. A skill is what closes that gap — the syntax, the traps that
 * come of the tokenizer having no escape sequences, and a worked template
 * close enough to copy.
 *
 * The argument tables are generated from resume_builder/schema.ts, the same
 * allowlist the renderer checks against, so an argument added to the language
 * appears here without anyone remembering to add it twice.
 *
 * Skills are text, not behaviour. Whether the model's output is any good is
 * still checked afterwards — agents/tools.ts parses every generated document
 * before it is allowed to reach the workspace.
 */

import { argSpellings, RESERVED_NAMES } from "../resume_builder/schema";
import { COVER_LETTER_SOURCE, SAMPLE_SOURCE } from "../resume_builder/samples";

export type SkillName = "resb-resume" | "resb-cover-letter";

export interface Skill {
    name: SkillName;
    /** One line, for a tool/skill listing. */
    description: string;
    /** The instruction text itself, ready to concatenate into a prompt. */
    instructions: string;
}

/** `` `fs` / `fontSize` `` — every spelling of an argument, from the allowlist. */
function argList(keyword: string): string {
    return argSpellings(keyword)
        .map((spellings) => spellings.map((name) => `\`${name}\``).join(" / "))
        .join(", ");
}

/**
 * The part both skills need: what the language is, and what will bite.
 *
 * The traps are listed ahead of the reference on purpose. Every one of them is
 * something a model does by habit from other markup — decimals, escaped
 * apostrophes, a stray comment at the top — and reading the grammar first
 * doesn't stop any of them.
 */
const LANGUAGE = `## The \`.resb\` language

A document is exactly two blocks, in this order, and nothing else before them:

\`\`\`
macro:(
    Heading: Cell(fw : 700, fs : 15, mt : 16, mb : 3, rule : 1, c : 'accent')
)
main:(
    Heading: 'Experience'
)
\`\`\`

\`macro:\` defines named layouts. \`main:\` fills them with content. A name used in
\`main:\` must be defined in \`macro:\`, and can be used as often as the page needs
— which is what makes every section heading identical and restyling all of them
one edit.

Statements are separated by commas. The last one in a block needs no comma.

### Values

Text is quoted, \`'like this'\` or \`"like this"\`. Numbers are bare and **whole**.
A \`|\` separates the values handed to one layout:

\`\`\`
Role: '**AI Research Intern**, Synopsys — Dublin' | 'July 2025 – June 2026'
\`\`\`

Inside any value, \`**text**\` is bold and \`*text*\` is italic. That is the whole
of the inline markup — there is no link syntax, no underline, no code span.

### What will bite

These are the mistakes that make a document fail to parse. Read them before
writing anything.

1. **There are no escape sequences.** \`\\'\` is not an escaped quote, it is a
   backslash followed by the end of the string. A value containing an
   apostrophe must be written in double quotes: \`"a developer's resume"\`. A
   value containing both kinds of quote has to give one of them up — use a
   typographic apostrophe (’) inside single quotes.
2. **Numbers are integers.** \`fs : 12\` is fine; \`fs : 12.5\` and \`mt : -4\` are
   both syntax errors. There are no negative margins in this language.
3. **A layout cannot be named ${RESERVED_NAMES.map((n) => `\`${n}\``).join(" or ")}.** The tokenizer reads those as
   keywords, so the parser would take the definition's own name for one. Name a
   layout after the part of the page it draws: \`Heading\`, \`Role\`, \`Points\`.
4. **An unknown argument is an error, not a no-op.** Only the names in the
   tables below are legal. A typo stops the document rather than being ignored.
5. **Comments go after both blocks.** \`// to end of line\` and \`/* several
   lines */\` both work, but anything ahead of \`macro:\` is rejected, and a
   comment must not spell out \`macro:(\` or \`main:(\` — the splitter counts
   headers without reading around comments and would see one block too many.
6. **Output the document and nothing else.** No prose before it, no explanation
   after it, and no \`\`\` fences around it. The text is written straight to a
   file and compiled.

### Cell

One piece of text: a name, a heading, a date, a bullet, a paragraph.

Arguments: ${argList("Cell")}

The ones that carry a resume: \`fs\` size in px, \`fw\` weight (400 or 700),
\`mt\`/\`mb\` space above and below in px, \`ps : 0\` to drop the default padding,
\`ta\` text alignment (\`'Left'\`, \`'Center'\`, \`'Right'\`, \`'Justify'\`),
\`rule : 1\` for the line under a section heading, \`bullet : 1\` for a bullet
point, \`nowrap : 1\` to keep a date on one line, \`grow : 1\` to take a row's
spare width, and \`c\` for colour.

Leave \`text\`, \`className\` and \`name\` alone — \`main:\` supplies the text, and a
class has no stylesheet to match in the compiled document.

### Block

Cells laid across the page, or stacked down it.

Arguments: ${argList("Block")}

\`dir : 'Column'\` stacks, the default \`'Row'\` lays across. \`spread : 'Between'\`
pushes the first cell and the last apart — a job title with its dates opposite.
\`gap\` is the space between cells in px.

A block draws **one cell per value it is given, and repeats its last cell** once
it runs out. That is why a bullet list defines a single cell and grows just by
adding another value:

\`\`\`
macro:(
    Points: Block(dir : 'Column', gap : 3, mt : 3, mb : 7,
        Cell(fs : 12, ps : 0, bullet : 1)
    )
)
main:(
    Points: 'First point.' | 'Second point.' | 'A third, from one cell.'
)
\`\`\`

### Colour and type

\`c : 'accent'\` refers to the document's accent, set by the builder's picker —
use it for the name, the section headings and their rules so one control
restyles all of them. Greys can be named outright: \`'ink'\`, \`'muted'\`,
\`'faint'\`, \`'white'\`. A hex code like \`'#1e3a8a'\` also works. Anything
unrecognised is ignored and the element keeps what it inherited.

\`font\` on a cell or block overrides the document's typeface: \`'georgia'\`,
\`'cambria'\`, \`'garamond'\`, \`'times'\`, \`'palatino'\`, \`'calibri'\`, \`'segoe'\`,
\`'arial'\`, \`'verdana'\`.`;

const RESUME_INSTRUCTIONS = `You are writing a resume in \`.resb\`, this application's own resume language.

${LANGUAGE}

## Writing the resume

Work from the applicant's real history and nothing else. Never invent an
employer, a date, a degree, a metric or a publication. Tailoring means choosing
what to lead with and how to word it — selection and emphasis only. If the
applicant's profile doesn't cover something the posting asks for, leave it out
rather than filling the gap.

Structure, in order: name, contact line, a short summary, then Experience
(most recent first), then whichever of Projects, Publications, Education,
Skills and Achievements the applicant actually has. Bold the job title and the
employer inside a Role value; keep dates in the second value so they sit
opposite. Lead each bullet with what was built or changed, and keep the numbers
the applicant stated.

Reuse this layout unless there's a reason not to — it is known to compile and
to fit an A4 page:

\`\`\`
${SAMPLE_SOURCE.slice(SAMPLE_SOURCE.indexOf("macro:("), SAMPLE_SOURCE.indexOf("main:("))}\`\`\`

Then write \`main:(\` with the applicant's own content, using those names.`;

const COVER_LETTER_INSTRUCTIONS = `You are writing a cover letter in \`.resb\`, this application's own document language.

${LANGUAGE}

## Writing the letter

A letter needs no new vocabulary — the same Cell and Block, arranged as one
column rather than dated entries. Three or four short paragraphs, first person,
addressed to the hiring team. Open with the specific role, connect two or three
things from the applicant's background to what the posting asks for, and close
briefly.

Write from the applicant's real experience only. No invented employers, dates or
numbers, and no placeholder like \`[Hiring Manager Name]\` — address the team if
no name is known. Set the body with \`ta : 'Justify'\`, the way a letter is
usually set.

This layout is known to compile:

\`\`\`
${COVER_LETTER_SOURCE.slice(
    COVER_LETTER_SOURCE.indexOf("macro:("),
    COVER_LETTER_SOURCE.indexOf("main:(")
)}\`\`\`

Then write \`main:(\` with the letter itself.`;

export const RESB_RESUME_SKILL: Skill = {
    name: "resb-resume",
    description: "Write a resume as a .resb document for the builder.",
    instructions: RESUME_INSTRUCTIONS,
};

export const RESB_COVER_LETTER_SKILL: Skill = {
    name: "resb-cover-letter",
    description: "Write a cover letter as a .resb document for the builder.",
    instructions: COVER_LETTER_INSTRUCTIONS,
};

export const SKILLS: Record<SkillName, Skill> = {
    "resb-resume": RESB_RESUME_SKILL,
    "resb-cover-letter": RESB_COVER_LETTER_SKILL,
};

/** Looks a skill up by name. Returns undefined rather than throwing — a model
 *  naming a skill that doesn't exist is a prompt to correct, not a crash. */
export function getSkill(name: string): Skill | undefined {
    return SKILLS[name as SkillName];
}

/** The skills on offer, for a listing a model can choose from. */
export function listSkills(): { name: SkillName; description: string }[] {
    return Object.values(SKILLS).map(({ name, description }) => ({ name, description }));
}
