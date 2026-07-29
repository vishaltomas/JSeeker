import { Token } from './types';

/** True for a single 0-9 character. Deliberately not `!Number.isNaN(char)`:
 * Number.isNaN doesn't coerce, so it's false for every string, and the
 * coercing `Number(char)` reads "" and " " as 0 — both would pass as digits. */
function isDigit(char: string | undefined): boolean {
    return char !== undefined && char >= "0" && char <= "9";
}

export class Tokenizer{
    _string : string = "";
    _cursor : number = 0;
    constructor(){
        this._string = ""
        this._cursor = 0;
    }
    
    init (str: string){
        this._string = str;
        this._cursor = 0;
    }
    // To check whether the program reached end of line
    isEOF(){
        return this._cursor === this._string.length
    }
    hasMoreTokens(){
        return this._cursor < this._string.length;
    }
    getNextToken(): Token | null {
        if(!this.hasMoreTokens()) {
            return null;
        }
        const str = this._string.slice(this._cursor);
        // For extracting Number tokens
        let matched = /^\d+/.exec(str)
        if (matched !== null){
            this._cursor += matched[0].length
            return {
                type: 'NUMBER',
                value: matched[0]
            }
        }
        // For extracting string tokens
        matched = /\"[^"]*\"/.exec(str)
        if (matched !== null){
            this._cursor += matched[0].length
            return {
                type: 'STRING',
                value: matched[0]
            }
        }
        // Nothing matched — no more tokens to hand out.
        return null;
    }

    
}