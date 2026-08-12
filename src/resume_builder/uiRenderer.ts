import { createElement, Fragment, ReactNode } from "react";
import * as components from './ui/Components';
import { ASTNode } from "./types";
import { stringTag } from "yaml/util";

const SPECIAL_IDENTIFIERS = [
    "macro",
    "main"
]

const KEYWORDS = [
    'Cell',
    'Block'
]

/**
 * Maps the argument names written in `.resb` source to the component prop each
 * one sets — `Cell(fw: 200)` becomes `<Cell fontWeight={200} />`. Canonical prop
 * names map to themselves so both the short and long spelling are accepted,
 * which also makes this the allowlist of legal arguments per keyword: a name
 * absent from its keyword's table is not a valid parameter.
 */
const KEYWORD_ARGS_MAPPING: {
    Cell: Record<string, keyof components.CellProps>;
    Block: Record<string, keyof components.BlockProps>;
} = {
    'Cell':{
        // shorthand
        'fw': 'fontWeight',
        'fs': 'fontSize',
        'fst': 'fontStyle',
        'al': 'align',
        'pd': 'padding',
        'ps': 'paddingSize',
        'txt': 'text',
        'cls': 'className',
        'ta': 'textAlign',
        'mt': 'marginTop',
        'mb': 'marginBottom',
        // canonical spellings
        'fontWeight': 'fontWeight',
        'fontSize': 'fontSize',
        'fontStyle': 'fontStyle',
        'align': 'align',
        'textAlign': 'textAlign',
        'padding': 'padding',
        'paddingSize': 'paddingSize',
        'text': 'text',
        'className': 'className',
        'marginTop': 'marginTop',
        'marginBottom': 'marginBottom',
        'rule': 'rule',
        'bullet': 'bullet',
        'grow': 'grow',
        'nowrap': 'nowrap',
        'font': 'font',
        'c': 'color',
        'bg': 'background',
        'color': 'color',
        'background': 'background'
    },
    'Block':{
        // `Block` takes its cells positionally; the rest are named args.
        // `children` and `numChildren` are derived from the parsed args, so
        // they are deliberately not settable from source.
        'name': 'name',
        'dir': 'direction',
        'gap': 'gap',
        'mt': 'marginTop',
        'mb': 'marginBottom',
        'direction': 'direction',
        'spread': 'spread',
        'marginTop': 'marginTop',
        'marginBottom': 'marginBottom',
        'font': 'font',
        'c': 'color',
        'bg': 'background',
        'color': 'color',
        'background': 'background'
    }
}


export type UINodeTemplate = (...text: string[]) => ReactNode;

export type ArgPair = { __arg: string; value: unknown };

export type BuildResult = ReactNode | BuildResult[] | UINodeTemplate | ArgPair | null | string | number;

export class ASTToReactNode{
    // _domTree: Record<string, any> = {};
    _macros: Record<string, any> = {};
    _isMacro: boolean = false;
    _isLocal: boolean = false;

    NodeBuilder(node: ASTNode): BuildResult{
        const nodeType = node.type;
        if(nodeType == 'Program'){
            // Map over the body of node
            const nodeBody = node.body;
            if(nodeBody.length < 1) console.log(
                `${this.constructor.name}: ${this.NodeBuilder.name}: 
                There are no child nodes present in Program`)
            // Get the React Nodes of child node
            const childNodes: BuildResult[] = []
            nodeBody.map((child, index)=>{
                // pass the child node to the function
                childNodes.push(this.NodeBuilder(child));
            })
            return childNodes;
        }
        else if (nodeType == 'BlockStatement'){
            // Map over the body of node
            const nodeBody = node.body;
            if(nodeBody.length < 1) console.log(
                `${this.constructor.name}: ${this.NodeBuilder.name}: 
                There are no child nodes present under the block statement`);
            // Get the React Nodes of child node
            const childNodes: BuildResult[] = []
            nodeBody.map((child, index)=>{
                // pass the child node to the function
                childNodes.push(this.NodeBuilder(child));
            })
            return childNodes;
        }
        else if (nodeType == 'Statement'){
            /**
             * There are two types of special block statements:
             *  1. macro: Here we define the different cell types with different parameters that are
             *     used in the main part.
             *  2. main: Here user defines the content of each cell by the user.     
             */
            const identifier = node.identifier.value;
            if(identifier == 'macro') this._isMacro = true;
            // an argument inside a keyword's parentheses: hand the name/value pair
            // straight back to the keyword rather than registering it as a macro
            if(this._isLocal) return { __arg: identifier, value: this.NodeBuilder(node.initializer) };
            // `macro:` and `main:` are the section headers, not references to a
            // macro — build the body and hand it back without a symbol lookup
            if(SPECIAL_IDENTIFIERS.includes(identifier)){
                const body = this.NodeBuilder(node.initializer);
                if(identifier == 'macro'){
                    this._isMacro = false;
                    // definitions render nothing of their own
                    return null;
                }
                return body;
            }
            // if its macro add it to the _macros table
            if (this._isMacro){
                this._macros[identifier] = this.NodeBuilder(node.initializer);
                return null;
            }
            // Constructing DOMTree under main: the identifier names a macro and
            // the initializer supplies its text. A lone literal is not an arg
            // list — wrap it, or the spread in GenerateUIComponent would hand
            // each character to a separate cell.
            const value = this.NodeBuilder(node.initializer);
            const args = (Array.isArray(value) ? value : [value]) as (string | number)[];
            return this.GenerateUIComponent(identifier, args);
        }
        else if (nodeType == 'BinaryExpression'){  
            const left = this.NodeBuilder(node.left)
            const right = this.NodeBuilder(node.right)
            const rightNodeWrapper = !Array.isArray(right) ? [right] : right;
            return [left, ...rightNodeWrapper];
        }
        else if (nodeType == 'Keyword') {
            const nodeValue = node.value;
            // the statements inside these parentheses are this keyword's arguments,
            // not macro definitions. Save and restore rather than clearing: a nested
            // keyword must hand control back with the flag still set, because the
            // enclosing keyword's argument list isn't finished yet.
            const wasLocal = this._isLocal;
            this._isLocal = true;
            // args.type is BlockStatement
            const args = this.NodeBuilder(node.args) as BuildResult[];
            this._isLocal = wasLocal;

            // Split the args into this keyword's own parameters and its rendered
            // children, translating each argument name into the prop it sets
            const mapping = KEYWORD_ARGS_MAPPING[nodeValue as keyof typeof KEYWORD_ARGS_MAPPING];
            const params: Record<string, any> = {}
            const cells: UINodeTemplate[] = []
            for(const arg of args){
                if(arg && typeof arg === 'object' && '__arg' in arg){
                    const { __arg: name, value } = arg as ArgPair;
                    const prop = mapping?.[name];
                    if(!prop) throw new SyntaxError(`${this.constructor.name}: ${this.NodeBuilder.name}:
                Unknown argument '${name}' for ${nodeValue}`);
                    params[prop] = value;
                }
                else cells.push(arg as UINodeTemplate);
            }

            // React node to be rendered, once the text arrives from `main:`
            let uiNode: UINodeTemplate;
            switch(nodeValue){
                case 'Cell': {
                    uiNode = (text: string) => components.Cell({
                        className: "",
                        ...params,
                        text: text
                    });
                    break;
                }
                case 'Block':{
                    uiNode = (...text: string[]) => {
                        // A block draws one cell per value it's given. Run out
                        // of cells and the last one repeats, so a column of
                        // bullets is defined once and grows by adding another
                        // value in `main:` — no need to declare six cells to
                        // write six bullet points.
                        const count = Math.max(cells.length, text.length);
                        return components.Block({
                            ...params,
                            // derived from the parsed args, so not settable from source.
                            // Cell is invoked as a plain function, so its result carries
                            // no key — wrap each child to keep React quiet about the list.
                            children: Array.from({ length: count }, (_unused, index) =>
                                createElement(
                                    Fragment,
                                    { key: index },
                                    cells[Math.min(index, cells.length - 1)](text[index])
                                )),
                            numChildren: count
                        });
                    };
                    break;
                }
               default: throw new SyntaxError(`${this.constructor.name}: ${this.NodeBuilder.name}: Unidentified symbol`);
            }

            return uiNode;
        }
        else if (nodeType == 'Literal'){
            return node.value;
        }
        else throw new SyntaxError(`Invalid node type: ${nodeType}`);
    }

    GenerateUIComponent(identifier: string, args: (string | number)[]): ReactNode{
        if(this._macros[identifier]) {
            return this._macros[identifier](...args);
        }
        throw new SyntaxError(`${this.constructor.name}: ${this.NodeBuilder.name}: ${identifier} is not defined in symbol table`)
        
    }
}


