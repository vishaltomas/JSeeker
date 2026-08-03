
import { Parser } from "./parser";
import * as fs from 'fs';

let parser = new Parser()
let file: string = fs.readFileSync('./samples/sample-resume.resb', 'utf-8')
console.log(parser.parse(file))