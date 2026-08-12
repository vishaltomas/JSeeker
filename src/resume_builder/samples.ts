/**
 * A worked example of the language: a complete, two-page resume.
 *
 * It lives here as a string rather than as a file under samples/ because the
 * workspace seeds a copy of it on first run (see main/builderWorkspace.ts),
 * and a packaged app has no source tree to read it out of.
 */
export const SAMPLE_SOURCE = `macro:(
    Name: Cell(fw : 700, fs : 30, ta : 'Center', ps : 0, c : 'accent'),
    Contact: Cell(fs : 12, ta : 'Center', ps : 0, mt : 3, c : 'muted'),
    Summary: Cell(fs : 12, ps : 0, mt : 11),
    Heading: Cell(fw : 700, fs : 15, ps : 0, mt : 16, mb : 3, rule : 1, c : 'accent'),
    Role: Block(spread : 'Between', gap : 16, mt : 6,
        Cell(fs : 13, ps : 0, grow : 1),
        Cell(fs : 13, ps : 0, nowrap : 1)
    ),
    Points: Block(dir : 'Column', gap : 3, mt : 3, mb : 7,
        Cell(fs : 12, ps : 0, bullet : 1)
    ),
    Line: Cell(fs : 12, ps : 0, mt : 3)
)
main:(
    Name: 'Vishal Thomas',
    Contact: 'Dublin 15, Ireland | vishaltomas@outlook.com | +353 89 471 2696 | linkedin.com/in/vishaltomas',
    Contact: 'github.com/vishaltomas',

    Summary: 'AI/ML Engineer with two peer-reviewed IEEE publications (ETS 2026, DFTS 2026) on the reliability of transformer models, and 3 years of production data engineering experience at scale. Deep fluency with the modern AI stack (PyTorch, Hugging Face, LangChain) paired with proven delivery of robust, production-aware pipelines on Azure and AWS. Drives work end-to-end — from problem framing through implementation, evaluation, and publication.',

    Heading: 'Experience',
    Role: '**AI Research Intern**, Synopsys — Dublin, Ireland' | 'July 2025 – June 2026',
    Points: 'Conducted research on the reliability of transformer-based embedding models within the EU-funded dAIEDGE network of excellence for trustworthy, efficient AI at the edge (Silicon Innovation group).'
        | 'Quantified the impact of hardware faults on model accuracy by injecting bit flips into the exponent bits of FP32 (IEEE 754) weights, benchmarking degradation across 4 MTEB datasets using PyTorch and Hugging Face.'
        | 'Co-developed fault-mitigation strategies (bit masking, quantization, thresholding); research accepted for publication at **IEEE ETS 2026**.'
        | 'Extended fault-injection analysis to activations in a vector-retrieval (RAG) pipeline, applying statistical fault injection to cut experiment time and compute cost; results published at **IEEE DFTS 2026**.'
        | 'Benchmarked multiple LLMs, embedding models, and re-rankers for the in-house RAG system, producing systematic performance and limitation analyses that informed model selection.'
        | 'Migrated core software packages to newer versions, improving runtime performance and reducing build size.',

    Role: '**Associate Software Engineer**, IQVIA — India' | 'October 2021 – August 2024',
    Points: 'Built 10+ Azure Data Factory pipelines and Python notebooks in Azure Synapse Analytics, integrating data from 10+ sources via REST and Graph APIs.'
        | 'Developed Python automation that reduced data-quality-check time by 40%, processing millions of records weekly, and automated data reprocessing flows in Master Data Management systems.'
        | 'Optimized Delta Table queries in Azure Databricks, cutting query response times by 80%.'
        | 'Integrated data pipelines between SAP ERP and Salesforce, eliminating manual data-sync effort and improving application reliability.'
        | 'Designed microservice architectures and deployed 10+ MuleSoft applications via GitLab CI/CD, using AWS S3 as a cache for fast retrieval of metadata and log files.'
        | 'Designed data profiles and standardization routines to characterize datasets, partnering with cross-functional teams to translate business needs into agile software solutions.',

    Heading: 'Publications',
    Points: "“Towards Resilient Transformer-Encoders: Hardware-Agnostic Strategies to Mitigate Hardware Faults” — *IEEE European Test Symposium (ETS)*, 2026."
        | "“On the Efficacy of Vector Retrieval Systems under Hardware Faults” — *IEEE International Symposium on Defect and Fault Tolerance in VLSI and Nanotechnology Systems (DFTS)*, 2026.",

    Heading: 'Projects',
    Role: '**Retrieval-Augmented Generation with BM25 Scoring**' | 'github.com/vishaltomas/rag_bm25',
    Points: 'Developed a RAG system using BM25 scoring to retrieve top relevant documents for the context.'
        | 'Engineered a custom Radix Tree and multithreaded document indexer to improve retrieval speed. *(Python, NLTK, NumPy)*',

    Heading: 'Education',
    Role: '**University College Cork**, MSc in Mathematical Modelling and Machine Learning' | 'Sept 2024 – Sept 2025',
    Points: '**Grade:** First Class Honours (1:1)'
        | '**Coursework:** Neural Networks, Deep Learning, Reinforcement Learning, Statistics, Mathematical Modelling, Data Science',
    Role: '**APJ Abdul Kalam Technological University**, BTech in Computer Science and Engineering' | 'August 2017 – July 2021',
    Points: '**GPA:** 8.6/10.0',

    Heading: 'Skills',
    Line: '**Programming:** Python, C, C++, SQL, JavaScript',
    Line: '**AI/ML:** PyTorch, TensorFlow, Hugging Face Transformers, scikit-learn, LangChain, NumPy, Pandas, LLM & RAG evaluation (MTEB), model quantization',
    Line: '**Data & Cloud:** Azure (Synapse, Data Factory, Databricks), AWS (S3), Apache Spark, Delta Lake, Snowflake',
    Line: '**Engineering:** Git, GitLab CI/CD, Flask, MuleSoft, code review, testing, reproducible ML experiments',

    Heading: 'Achievements',
    Points: '**IQVIA Impact Team Award (2021)** — Recognized for outstanding performance and leadership in project delivery.'
        | '**Reboot Kerala Hackathon, 1st place (2019, Education category)** — Built an object-recognition-based student attendance tracker using OpenCV.'
)

/*
  Notes on this document.

  Everything is built from the two keywords, Cell and Block.

    Cell  — one piece of text. fs/fw set its type, ta aligns the lines,
            mt/mb space it, rule : 1 draws the line under a section heading,
            bullet : 1 makes it a bullet point, nowrap : 1 keeps a date on
            one line, grow : 1 lets it take a row's spare width,
            font : 'arial' sets its typeface, and c / bg colour it.
    Block — cells laid across the page (spread : 'Between' pushes the first
            and last apart) or stacked down it (dir : 'Column').

  A block draws one cell per value it is given, and repeats its last cell once
  it runs out — which is why Points defines a single bullet cell and a list
  grows just by adding another value below.

  The colour pickers above the preview set the document's accent, which
  c : 'accent' refers to — so the name, the section headings and their rules
  all follow one control. A colour can also be named outright: c : 'muted',
  c : 'faint', or a hex code like c : '#1e3a8a'. bg does the same for a
  background.

  The font picker above the preview sets the face for the whole document. A
  cell or a block can name its own instead — font : 'arial', 'garamond',
  'calibri', 'cambria', 'times', 'palatino', 'segoe', 'verdana' — which is how
  you set headings in a sans face and leave the body in a serif one.

  Layout goes in the first block, content in the second, and a name in the
  content block picks the layout it is drawn with — so restyling every job
  title is one edit at the top.

  A definition's name can't be Cell or Block: the tokenizer would read the
  name as the keyword. Hence Heading, Role, Points, Line.

  Inside any value, **text** is bold and *text* is italic.

  Two things the editor is strict about. Comments have to sit after both
  blocks, since anything ahead of them is treated as a mistake. And a comment
  must not spell out a block header, because the splitter counts headers
  without reading around comments and would see one block too many.
*/
`;

/**
 * A cover letter, to show the language doing something other than a resume:
 * one column of text, a letterhead that matches the resume's, and a date
 * sitting opposite the recipient rather than a job title.
 */
export const COVER_LETTER_SOURCE = `macro:(
    Name: Cell(fw : 700, fs : 26, ps : 0, c : 'accent'),
    Contact: Cell(fs : 12, ps : 0, mt : 3, c : 'muted'),
    Rule: Cell(fs : 1, ps : 0, mt : 10, rule : 1, c : 'accent'),
    Meta: Block(spread : 'Between', gap : 16, mt : 20,
        Cell(fs : 12, ps : 0, grow : 1),
        Cell(fs : 12, ps : 0, nowrap : 1)
    ),
    Address: Cell(fs : 12, ps : 0, mt : 2),
    Greeting: Cell(fs : 12, ps : 0, mt : 18),
    Body: Cell(fs : 12, ps : 0, mt : 11, ta : 'Justify'),
    Closing: Cell(fs : 12, ps : 0, mt : 18),
    Sign: Cell(fs : 12, fw : 700, ps : 0, mt : 2, c : 'accent')
)
main:(
    Name: 'Vishal Thomas',
    Contact: 'Dublin 15, Ireland | vishaltomas@outlook.com | +353 89 471 2696 | linkedin.com/in/vishaltomas',
    Rule: '',

    Meta: '**Hiring Manager**' | '11 August 2026',
    Address: '[Company Name]',
    Address: '[Street, City, Country]',

    Greeting: 'Dear Hiring Manager,',

    Body: 'I am writing to apply for the **[Role]** position at **[Company Name]**. I am an AI/ML engineer with two peer-reviewed IEEE publications on the reliability of transformer models and three years of production data engineering behind them — a combination that means I can both investigate a hard question and ship the answer.',

    Body: 'At Synopsys I studied how hardware faults degrade transformer-based embedding models, injecting bit flips into FP32 weights and benchmarking the damage across four MTEB datasets in PyTorch. The work turned into two publications (ETS 2026, DFTS 2026) and a set of mitigations — bit masking, quantization, thresholding — that hold up without special hardware. I also benchmarked the LLMs, embedding models and re-rankers behind an in-house RAG system, which is where I learned how much of model selection is measurement rather than opinion.',

    Body: 'Before that, three years at IQVIA taught me what production costs. I built Azure Data Factory pipelines across ten-plus sources, cut data-quality-check time by 40% with Python automation, and took query response times down by 80% by reworking Delta Table queries. Microservices, CI/CD and code review were the daily habit rather than the exception.',

    Body: 'What draws me to [Company Name] is [the specific thing — a product, a paper, a problem they have]. Replace this sentence with a real one: it is the only paragraph a reader can tell you did not write for them.',

    Body: 'I would welcome the chance to talk about how I could help. Thank you for your time and consideration.',

    Closing: 'Sincerely,',
    Sign: 'Vishal Thomas'
)

/*
  A cover letter needs no new vocabulary — the same Cell and Block, arranged
  as one column instead of dated entries.

  Worth noticing:
    Rule    a Cell with no text and rule : 1, which draws the line under the
            letterhead. Give it '' in the content block.
    Meta    a Between block, so the recipient sits left and the date right.
    Body    ta : 'Justify' sets the paragraphs flush on both edges, the way a
            letter is usually set. Drop it for a ragged right edge.
    Address repeated twice, once per line of the recipient's address — any
            name can be reused as often as the page needs it.

  The bracketed placeholders are meant to be replaced. The fourth paragraph
  especially: a letter that could have been sent to anyone reads like it was.
*/
`;
