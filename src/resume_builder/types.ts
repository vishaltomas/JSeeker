export interface Token {
    type: any,
    value: any
}


/** A node in the parsed resume AST. Named `ASTNode` rather than `Node` so it
 * doesn't shadow the DOM's global `Node` — the renderer deals in both. */
export type ASTNode =
  | { type: 'Program';          body: ASTNode[] }
  | { type: 'BlockStatement';   body: ASTNode[] }
  | { type: 'Identifier';       value: string }
  | { type: 'Statement';        identifier: Token; initializer: ASTNode }
  | { type: 'Keyword';          value: string; args: ASTNode }
  | { type: 'BinaryExpression'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'Literal';          value: string | number };