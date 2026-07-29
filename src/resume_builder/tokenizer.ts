import { Token } from './types';

// Token specifications
// Every pattern must be anchored with ^: _match advances the cursor by the
// match length alone, so a pattern that matches further into the string leaves
// the cursor short and knocks the rest of the token stream out of alignment.
const tokenSpec : [RegExp, string|null][]= [
    [/^\d+/, 'NUMBER'],
    [/^"[^"]*"/, 'STRING'],
    [/^'[^']*'/, 'STRING'],
    // skipping whitespaces
    [/^\s+/, null],
    // Skipping comments
    [/^\/\/.*/, null],
    [/^\/\*[\s\S]*?\*\//, null]
] 

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
    
    // Matches regular expression with string
    _match (regExp:RegExp, str:string){
        let matched = regExp.exec(str)
        if (matched !== null){
            // updaate the cursor with length of token
            this._cursor += matched[0].length
            return matched[0]
        }
        return null
    }

    getNextToken(): Token | null {
        if(!this.hasMoreTokens()) {
            return null;
        }
        const str = this._string.slice(this._cursor);

        for (const [regExp, tokenType] of tokenSpec){
            // For extracting different types of tokens
            const tokenValue = this._match(regExp, str)
            if (tokenValue == null) continue;
            // skip left-end whitespaces
            if(tokenType == null) return this.getNextToken(); 
            return {
                type: tokenType,
                value: tokenValue
            }
        }
        console.log(str)
        // Nothing matched — no more tokens to hand out.
        throw new SyntaxError(`Unexpected token: ${str[0]}`);
    }
    
}