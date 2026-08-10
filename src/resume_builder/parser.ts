import { Tokenizer } from './tokenizer';
import { ASTNode, Token } from './types';


// Implementing a Recursive Descent Parser
class ParseTokenResponse{
    _current: number;
    _tokens: Token[];
    constructor(tokens: Token[]){
        this._current = 0;
        this._tokens = tokens;
    }
    
    _peek(){
        return this._tokens[this._current];
    }
    _previous(){
        return this._tokens[this._current - 1];
    }
    _isEOF(){
        return this._peek().type == 'EOF'
    }
    _advance(){
        if(!this._isEOF()) this._current++;
        return this._previous();
    }
    // Consumes the current token and checks whether the type and value
    // is same as the arguments passed to function if not throw error or 
    // else advance to next token
    _consume(tokenType: string, tokenValue: string[] | string | null = null){
        const token = this._peek();
        // convert to array if its only string
        tokenValue =  !tokenValue || Array.isArray(tokenValue) ? tokenValue : [tokenValue] 
        if(token == null){
            throw new SyntaxError(`Unexpected end of input, expected type: ${tokenType}`);
        }
        if(token.type !==  tokenType){
            throw new SyntaxError(`Unexpected token [${this._current}] : ${token.value} of type ${token.type}, expected type: ${tokenType}`);
        }
        if(tokenValue && !tokenValue.includes(token.value)){
            throw new SyntaxError(`Unexpected token [${this._current}]  : ${token.value}  of type ${token.type}`);
        }
        return this._advance()
    }
    // Context Free Grammar
    // Rules implementation

    // block -> '(' (statement ','?) ? ')'
    // statementSeparator -> ','
    block(): ASTNode{
        this._consume('Punctuation', '(');
        // collect all statements
        const statements = [];
        while(!this._isEOF() && this._peek().value !== ')')
            {
                statements.push(this.statement());
                if(this._peek().value == ',') this._advance();
            }
        this._consume('Punctuation', ')');
        return {
            type: 'BlockStatement',
            body: statements
        };

    }

    // element -> KEYWORD block
    element(): ASTNode{
        const value = this._consume('Keyword').value;
        const args = this.block();
        return {
            type: 'Keyword',
            value,
            args
        };
    }

    // statement -> IDENTIFIER ':' (KEYWORD | block | expression) |
    statement(): ASTNode{
        // TODO: Should be Moved to block
        if(this._peek().type == 'Keyword') return this.element();
        /////////////////////////////////
        const identifier = this._consume('Identifier');
        // consume the ':' operator
        this._consume('Operator', ':');
        let initializer;
        if(this._peek().value == '(')  initializer = this.block();
        else if(this._peek().type == 'Keyword') initializer = this.element();
        else initializer = this.expression();

        return {
            type:'Statement',
            identifier,
            initializer
        }
    }



    // Binary operator -> |
    // expression -> ((NUMERIC | STRING ) ( | expression )*
    expression(): ASTNode{
        let expr: ASTNode;
        switch(this._peek().type){
            case 'NumericLiteral':{ expr = {
                type: 'Literal',
                value: this._advance().value
            }; break;}
            case 'StringLiteral': {expr = {
                type: 'Literal',
                value: this._advance().value
               
            }; break;}
            default: throw new SyntaxError('Unidentified literal'); 
        }
        while(!this._isEOF() && this._peek().value == '|'){
            const operator = this._advance().value;
            const right = this.expression();
            expr = {
                type: 'BinaryExpression',
                operator,
                left: expr,
                right
            };
        }
        return expr;
    }

    // program -> statements *
    program(): ASTNode{
        const statements = []
        while(!this._isEOF()){
            statements.push(this.statement());
        }
        return {
            type:'Program',
            body: statements
        }
    }
}

export class Parser{
    _string : string;
    _tokenizer : Tokenizer;
    _lookahead : Token | null = null;
    _tokens: Token[] = []
    _parseTokenResponse: ParseTokenResponse | null = null;
    constructor(){
        this._string = "";
        this._tokenizer = new Tokenizer();
    }
    /** Dumps the token stream to the console. Off by default: the editor
     *  re-parses on every keystroke, and it would also pollute stdout when the
     *  runner's AST output is redirected to a file. */
    debugTokens: boolean = false;
    parse(content: string){
        this._string = content;
        this._tokenizer.init(content)
        const tokens = this.Program().body;
        this._parseTokenResponse = new ParseTokenResponse(tokens);
        if(this.debugTokens){
            let counter = 1;
            tokens.forEach(element => {
                console.log(`${counter}: ${JSON.stringify(element)}`)
                counter++;
            });
        }
        return this._parseTokenResponse.program();
    }
    Program(){
        // Collect all the tokens from  the file
        while(this._lookahead?.type !== 'EOF'){
            // lookeahead is for predicitive parsing
            this._lookahead = this._tokenizer.getNextToken();
            this._tokens.push(this.Tokens());
        } 
        // Applying Recursive descent parsing to collected tokens
        return {
            type: 'Program',
            body: this._tokens
        };
    }

    /**
     * Tokens:
     *  1. Literal
     *     1. Numeric
     *     2. String
     *  2. Identifiers
     *  3. Keywords
     *  4. Operators
     *  5. Punctuations
     */
    Tokens(){
        switch (this._lookahead?.type){
            // Literals
            case 'NUMBER': return this.NumericLiteral();
            case 'STRING' : return this.StringLiteral();
            // Identifier
            case 'IDENTIFIER': return this.Identifier();
            // Operator
            case 'OPERATOR': return this.Operator();
            // Keyword
            case 'KEYWORD': return this.Keyword();
            // Punctuation
            case 'PUNCTUATION': return this.Punctuation();
            // End Of File
            case 'EOF': return this.EOF();
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

    Identifier(){
        const token = this._consume('IDENTIFIER')
        return{
            type: 'Identifier',
            value: token.value
        }
    }

    Keyword(){
        const token = this._consume('KEYWORD')
        return{
            type: 'Keyword',
            value: token.value
        }
    }

    Operator(){
        const token = this._consume('OPERATOR')
        return{
            type: 'Operator',
            value: token.value
        }
    }

    Punctuation(){
        const token = this._consume('PUNCTUATION')
        return{
            type: 'Punctuation',
            value: token.value
        }
    }

    EOF(){
        const token = this._consume('EOF')
        return {
            type: 'EOF',
            value: token.value
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
        return token
    }
}

