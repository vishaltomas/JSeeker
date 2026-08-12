import { Parser } from "./parser";
import { SAMPLE_SOURCE } from "./samples";

// Dumps the AST for the sample resume — a quick way to see what the parser
// makes of a document without going through the app.
console.log(JSON.stringify(new Parser().parse(SAMPLE_SOURCE), null, 2));
