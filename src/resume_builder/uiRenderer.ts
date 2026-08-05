import React, { ReactNode } from "react";
import * as components from './ui/Components';
import { ASTNode } from "./types";

const SPECIAL_IDENTIFIERS = [
    "macro",
    "main"
]

export class ASTToReactNode{
    _domTree: Record<string, any> = {};
    _macros: Record<string, any> = {};
    _isMacro: boolean = false;
    constructor(){
    }
    NodeBuilder(node: ASTNode): ReactNode | null{
        let uiNode = null;
        const nodeType = node.type;
        if(nodeType == 'Program'){
            // Map over the body of node
            const nodeBody = node.body;
            if(nodeBody.length < 1) console.log(
                `${this.constructor.name}: ${this.NodeBuilder.name}: 
                There are no child nodes present in Program`)
            // Get the React Nodes of child node
            const childNodes: ReactNode[] = []
            nodeBody.map((child, index)=>{
                // pass the child node to the function
                childNodes.push(this.NodeBuilder(child));
            })
            this._domTree = childNodes;
        }
        else if (nodeType == 'BlockStatement'){
            // Map over the body of node
            const nodeBody = node.body;
            if(nodeBody.length < 1) console.log(
                `${this.constructor.name}: ${this.NodeBuilder.name}: 
                There are no child nodes present under the block statement`);
            /**
             * There are two types of special block statements:
             *  1. macro: Here we define the different cell types with different parameters that are
             *     used in the main part.
             *  2. main: Here user defines the content of each cell by the user.     
             */
            // For macros, get all the cell types and store it in _macros
            // Since there are no ui element to be rendered here, it will return empty
            // element but the cell will be tracked in _macros.

            // Get the React Nodes of child node
            const childNodes: ReactNode[] = []
            nodeBody.map((child, index)=>{
                // pass the child node to the function
                childNodes.push(this.NodeBuilder(child));
            })
        }
        else if (nodeType == 'Statement'){

        }
        else if (nodeType == 'BinaryExpression'){}
        else if (nodeType == 'Identifier'){
            const nodeValue = node.value;
            if(!nodeValue) console.log(
                `${this.constructor.name}: ${this.NodeBuilder.name}: 
                The identifier is invalid`);
            if(!SPECIAL_IDENTIFIERS.includes(nodeValue)) this.
            
        }
        else if (nodeType == 'Literal'){}
        else throw new SyntaxError(`Invalid node type: ${nodeType}`);
        return uiNode;
    }
}


export class UIRenderer{
}