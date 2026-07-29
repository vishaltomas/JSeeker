import YAML from 'yaml';
import fs from 'fs';
import type { Store } from "../main/store";
import { Tokenizer } from './tokenizer';
import { Token } from './types';

export class Parser{
    _string : string;
    _tokenizer : Tokenizer;
    _lookahead : Token | null = null;
    constructor(){
        this._string = "";
        this._tokenizer = new Tokenizer();
    }
    parse(content: string){
        this._string = content;
        this._tokenizer.init(content)
        // lookeahead is for predicitive parsing
        this._lookahead = this._tokenizer.getNextToken();
        return this.Program();
    }
    Program(){
        return {
            type: 'Main',
            body: this.Literal()
        };
    }

    /**
     * Literals:
     *  1. NumericLiteral
     *  2. StringLiteral
     *  
     */
    Literal(){
        switch (this._lookahead?.type){
            case 'NUMBER': return this.NumericLiteral();
            case 'STRING' : return this.StringLiteral();
            default: throw new SyntaxError(`Unexpected literal value`);
        }
    }
    NumericLiteral(){
        const token = this._consume('NUMBER')
        return{
            type: 'NumericLiteral',
            value: Number(token.value) 
        };
    }
    
    StringLiteral(){
        const token = this._consume('STRING')
        return{
            type: 'StringLiteral',
            value: token.value.slice(1, -1)
        }
    }
    _consume(tokenType: string){
        /**
         * To process the current token and move to next token 
         * @param tokenType 
         */
        const token = this._lookahead;
        if(token == null){
            throw new SyntaxError(`Unexpected end of input, expected type: ${tokenType}`);
        }
        if(token.type !==  tokenType){
            throw new SyntaxError(`Unexpected token ${token.value} expected of type: ${token.type}`);
        }
        this._lookahead = this._tokenizer.getNextToken();
        return token
    }
}

