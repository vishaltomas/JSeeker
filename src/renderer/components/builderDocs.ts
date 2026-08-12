/**
 * The `.resb` language reference, shown in the builder's Docs tab.
 *
 * Kept as markdown next to the view that renders it rather than as a file on
 * disk, so it ships with the app and can't go missing from a packaged build.
 * Every argument listed here is one the renderer actually accepts — see
 * KEYWORD_ARGS_MAPPING in resume_builder/uiRenderer.ts, which is the allowlist
 * a name has to appear in to be legal.
 *
 * Written with one paragraph per line on purpose: the markdown renderer has
 * `breaks: true`, so a wrapped paragraph would come out with hard line breaks
 * in the middle of its sentences.
 */
export const BUILDER_DOCS = `# Writing a resume in \`.resb\`

A document is two blocks. **Macro** defines named layouts; **Main** fills them with your content. Each tab above holds one of them.

\`\`\`
macro:(
    Heading: Cell(fw : 700, fs : 15, rule : 1, mt : 16, mb : 3)
)
main:(
    Heading: 'Experience'
)
\`\`\`

A name in Main picks the layout it is drawn with, and the same name can be used as often as you like — that is what keeps every section heading identical and makes restyling all of them a single edit up in Macro.

## Values

Text goes in quotes, \`'like this'\` or \`"like this"\`. Numbers are bare. A \`|\` separates the values handed to one layout:

\`\`\`
Role: '**AI Research Intern**, Synopsys' | 'July 2025 – June 2026'
\`\`\`

Inside any value, \`**text**\` is **bold** and \`*text*\` is *italic*.

## Cell

One piece of text — a name, a heading, a date, a bullet, a paragraph.

| Argument | Meaning |
| --- | --- |
| \`fs\` / \`fontSize\` | Size in px |
| \`fw\` / \`fontWeight\` | 400 for regular, 700 for bold |
| \`fst\` / \`fontStyle\` | \`'Normal'\`, \`'Italic'\`, \`'SkewSmall'\`, \`'SkewMedium'\`, \`'SkewLarge'\` |
| \`font\` | Typeface for this cell — see the list below |
| \`ta\` / \`textAlign\` | \`'Left'\`, \`'Center'\`, \`'Right'\`, \`'Justify'\` — where the lines of text sit |
| \`al\` / \`align\` | \`'Left'\`, \`'Center'\`, \`'Right'\`, \`'Top'\`, \`'Bottom'\` — where the content box sits |
| \`mt\` / \`mb\` | Space above and below, in px (\`marginTop\` / \`marginBottom\`) |
| \`ps\` / \`paddingSize\` | Padding, in 4px steps — \`ps : 0\` for none |
| \`pd\` / \`padding\` | Which side the padding is on: \`'All'\`, \`'Top'\`, \`'Bottom'\`, \`'Left'\`, \`'Right'\` |
| \`rule\` | \`1\` draws a line under the cell — the rule beneath a section heading |
| \`bullet\` | \`1\` makes it a bullet point, with the text hanging off the marker |
| \`grow\` | \`1\` lets it take a row's spare width |
| \`nowrap\` | \`1\` keeps it on one line — dates read badly broken in two |
| \`c\` / \`color\` | Text colour — and the rule under a heading, which is drawn in it |
| \`bg\` / \`background\` | Background colour behind the cell |

## Block

Cells laid across the page, or stacked down it.

| Argument | Meaning |
| --- | --- |
| \`dir\` / \`direction\` | \`'Row'\` (default) or \`'Column'\` |
| \`spread\` | \`'Even'\` equal columns (default), \`'Between'\` pushes first and last apart, \`'Start'\` keeps them together |
| \`gap\` | Space between cells, in px |
| \`mt\` / \`mb\` | Space above and below, in px (\`marginTop\` / \`marginBottom\`) |
| \`font\` | Typeface for the whole band; its cells inherit it |
| \`c\` / \`color\` | Text colour for the band; its cells inherit it |
| \`bg\` / \`background\` | Background behind the whole band |

A block draws **one cell per value it is given, and repeats its last cell** once it runs out. That is why a bullet list defines a single cell and grows by adding another value:

\`\`\`
macro:(
    Points: Block(dir : 'Column', gap : 3, mt : 3, mb : 7,
        Cell(fs : 12, ps : 0, bullet : 1)
    )
)
main:(
    Points: 'First point.' | 'Second point.' | 'Add a value, get another bullet.'
)
\`\`\`

A title with a date opposite it is the other common shape:

\`\`\`
Role: Block(spread : 'Between', gap : 16, mt : 6,
    Cell(fs : 13, ps : 0, grow : 1),
    Cell(fs : 13, ps : 0, nowrap : 1)
)
\`\`\`

## Typefaces

The picker above the preview sets the face for the whole document. \`font\` on a cell or block overrides it — headings in a sans face over a serif body, for instance.

\`'georgia'\`, \`'cambria'\`, \`'garamond'\`, \`'times'\`, \`'palatino'\`, \`'calibri'\`, \`'segoe'\`, \`'arial'\`, \`'verdana'\`

## Colour

The accent picker above the preview sets one colour for the document, and \`c : 'accent'\` refers to it — so headings, their rules and the name all follow a single control:

\`\`\`
Heading: Cell(fw : 700, fs : 15, rule : 1, c : 'accent')
\`\`\`

A colour can also be named outright — \`'ink'\`, \`'muted'\`, \`'faint'\`, \`'white'\` — or given as a hex code, \`'#1e3a8a'\`. Anything else is ignored and the element keeps the colour it inherited, so a typo shifts nothing rather than painting the page an unintended colour.

## Comments

\`// to the end of the line\` and \`/* across several lines */\`.

Two limits worth knowing. Comments must come **after** both blocks — anything ahead of them is treated as a mistake. And a comment must not spell out a block header, because the editor counts headers without reading around comments and would see one block too many.

## Things that will bite

A layout can't be named \`Cell\` or \`Block\` — those are the keywords, and the parser would read the definition's own name as one. Name them for the part of the page they draw: \`Heading\`, \`Role\`, \`Points\`.

An argument name that isn't in the tables above is an error rather than a silent no-op, so a typo tells you where it is.

Three more arguments exist and are best left alone: \`text\` on a cell (Main supplies that — setting it here would be overwritten), and \`className\` / \`name\`, which put a class on the element. The rendered document carries no stylesheet for a class to match, so they do nothing on their own.

## Keys

**Ctrl+S** saves. **Ctrl+Enter** compiles the preview.
`;
