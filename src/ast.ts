export enum NodeType {
    Program,
    FunctionDeclaration,
    VariableDeclaration,
    ReturnStatement,
    IfStatement,
    WhileStatement,
    BlockStatement,
    ExpressionStatement,

    // Expressions
    BinaryExpression,
    UnaryExpression,
    CallExpression,
    Identifier,
    Literal,
    AssignmentExpression,
    MemberExpression,
    ArrayLiteral,
    ObjectLiteral,
    TernaryExpression,
    FunctionExpression,
    Property,
}

export interface BaseNode {
    type: NodeType;
    loc: { line: number; column: number; };
}

export interface ProgramNode extends BaseNode {
    type: NodeType.Program;
    body: StatementNode[];
}

export interface FunctionDeclarationNode extends BaseNode {
    type: NodeType.FunctionDeclaration;
    name: IdentifierNode;
    params: IdentifierNode[];
    body: BlockStatementNode;
}

export interface VariableDeclarationNode extends BaseNode {
    type: NodeType.VariableDeclaration;
    name: IdentifierNode;
    initializer: ExpressionNode | null;
}

export interface ReturnStatementNode extends BaseNode {
    type: NodeType.ReturnStatement;
    argument: ExpressionNode | null;
}

export interface IfStatementNode extends BaseNode {
    type: NodeType.IfStatement;
    test: ExpressionNode;
    consequent: BlockStatementNode;
    alternate: BlockStatementNode | null;
}

export interface WhileStatementNode extends BaseNode {
    type: NodeType.WhileStatement;
    test: ExpressionNode;
    body: BlockStatementNode;
}

export interface BlockStatementNode extends BaseNode {
    type: NodeType.BlockStatement;
    body: StatementNode[];
}

export interface ExpressionStatementNode extends BaseNode {
    type: NodeType.ExpressionStatement;
    expression: ExpressionNode;
}

export type StatementNode =
    | FunctionDeclarationNode
    | VariableDeclarationNode
    | ReturnStatementNode
    | IfStatementNode
    | WhileStatementNode
    | BlockStatementNode
    | ExpressionStatementNode;

export interface BinaryExpressionNode extends BaseNode {
    type: NodeType.BinaryExpression;
    operator: string;
    left: ExpressionNode;
    right: ExpressionNode;
}

export interface UnaryExpressionNode extends BaseNode {
    type: NodeType.UnaryExpression;
    operator: string;
    argument: ExpressionNode;
}

export interface CallExpressionNode extends BaseNode {
    type: NodeType.CallExpression;
    callee: ExpressionNode;
    args: ExpressionNode[];
    loc: { line: number; column: number; };
}

export interface IdentifierNode extends BaseNode {
    type: NodeType.Identifier;
    value: string;
}

export interface LiteralNode extends BaseNode {
    type: NodeType.Literal;
    value: number | string | boolean | null;
}

export interface AssignmentExpressionNode extends BaseNode {
    type: NodeType.AssignmentExpression;
    left: IdentifierNode | MemberExpressionNode;
    right: ExpressionNode;
}

export interface MemberExpressionNode extends BaseNode {
    type: NodeType.MemberExpression;
    object: ExpressionNode;
    property: ExpressionNode;
    computed: boolean;
}

export interface ArrayLiteralNode extends BaseNode {
    type: NodeType.ArrayLiteral;
    elements: ExpressionNode[];
}

export interface PropertyNode {
  key: IdentifierNode;
  value: ExpressionNode;
}

export interface ObjectLiteralNode extends BaseNode {
  type: NodeType.ObjectLiteral;
  properties: PropertyNode[];
}

export interface TernaryExpressionNode extends BaseNode {
    type: NodeType.TernaryExpression;
    test: ExpressionNode;
    consequent: ExpressionNode;
    alternate: ExpressionNode;
}

export interface FunctionExpressionNode extends BaseNode {
    type: NodeType.FunctionExpression;
    params: IdentifierNode[];
    body: BlockStatementNode;
}


export type ExpressionNode =
    | BinaryExpressionNode
    | UnaryExpressionNode
    | CallExpressionNode
    | AssignmentExpressionNode
    | MemberExpressionNode
    | ArrayLiteralNode
    | ObjectLiteralNode
    | TernaryExpressionNode
    | FunctionExpressionNode
    | IdentifierNode
    | LiteralNode;
