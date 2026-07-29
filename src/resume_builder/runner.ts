import { Parser } from "./parser";

let parser = new Parser()
console.log(parser.parse(` /*
     dfasdf
    */
    'asd'  
`))