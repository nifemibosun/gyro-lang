import { Token, TokenType } from './lexer.js';

export interface ASTNode {
    type: string;
    position?: { line: number; column: number };
}

export interface TypeAnnotation extends ASTNode {
    type: 'TypeAnnotation';
    name: string;
    genericArgs?: TypeAnnotation[];
    nullable?: boolean;
}

export interface Expression extends ASTNode {}

export interface LiteralExpression extends Expression {
    type: 'LiteralExpression';
    value: any;
    dataType: 'number' | 'string' | 'boolean' | 'null';
}

export interface IdentifierExpression extends Expression {
    type: 'IdentifierExpression';
    name: string;
}

export interface BinaryExpression extends Expression {
    type: 'BinaryExpression';
    left: Expression;
    operator: Token;
    right: Expression;
}

export interface UnaryExpression extends Expression {
    type: 'UnaryExpression';
    operator: Token;
    operand: Expression;
}

export interface CallExpression extends Expression {
    type: 'CallExpression';
    callee: Expression;
    arguments: Expression[];
}

export interface MemberExpression extends Expression {
    type: 'MemberExpression';
    object: Expression;
    property: Expression;
    computed: boolean;
}

export interface ArrayExpression extends Expression {
    type: 'ArrayExpression';
    elements: Expression[];
}

export interface ObjectLiteralExpression extends Expression {
    type: 'ObjectLiteralExpression';
    className: string;
    fields: ObjectField[];
}

export interface ObjectField extends ASTNode {
    type: 'ObjectField';
    key: string;
    value: Expression;
}

export interface AssignmentExpression extends Expression {
    type: 'AssignmentExpression';
    target: Expression;
    value: Expression;
    operator: Token;
}

export interface Statement extends ASTNode {}

export interface ExpressionStatement extends Statement {
    type: 'ExpressionStatement';
    expression: Expression;
}

export interface VariableDeclaration extends Statement {
    type: 'VariableDeclaration';
    name: string;
    typeAnnotation?: TypeAnnotation;
    initializer?: Expression;
    isConstant: boolean;
}

export interface FunctionDeclaration extends Statement {
    type: 'FunctionDeclaration';
    name: string;
    parameters: Parameter[];
    returnType?: TypeAnnotation;
    body: BlockStatement;
    isStatic?: boolean;
}

export interface Parameter extends ASTNode {
    type: 'Parameter';
    name: string;
    typeAnnotation?: TypeAnnotation;
    defaultValue?: Expression;
}

export interface BlockStatement extends Statement {
    type: 'BlockStatement';
    statements: Statement[];
}

export interface IfStatement extends Statement {
    type: 'IfStatement';
    condition: Expression;
    thenBranch: Statement;
    elseBranch?: Statement;
}

export interface WhileStatement extends Statement {
    type: 'WhileStatement';
    condition: Expression;
    body: Statement;
}

export interface ForStatement extends Statement {
    type: 'ForStatement';
    initializer?: VariableDeclaration | ExpressionStatement;
    condition?: Expression;
    increment?: Expression;
    body: Statement;
}

export interface ReturnStatement extends Statement {
    type: 'ReturnStatement';
    value?: Expression;
}

export interface BreakStatement extends Statement {
    type: 'BreakStatement';
}

export interface ContinueStatement extends Statement {
    type: 'ContinueStatement';
}

export interface ClassDeclaration extends Statement {
    type: 'ClassDeclaration';
    name: string;
    superClass?: string;
    fields: FieldDeclaration[];
    methods: FunctionDeclaration[];
}

export interface FieldDeclaration extends ASTNode {
    type: 'FieldDeclaration';
    name: string;
    typeAnnotation: TypeAnnotation;
    visibility?: 'public' | 'private' | 'protected';
    defaultValue?: Expression;
}

export interface TryStatement extends Statement {
    type: 'TryStatement';
    body: BlockStatement;
    catchClause?: CatchClause;
    finallyBlock?: BlockStatement;
}

export interface CatchClause extends ASTNode {
    type: 'CatchClause';
    parameter?: string;
    body: BlockStatement;
}

export interface ThrowStatement extends Statement {
    type: 'ThrowStatement';
    argument: Expression;
}

export interface ImportDeclaration extends Statement {
    type: 'ImportDeclaration';
    specifiers: ImportSpecifier[];
    source: string;
}

export interface ImportSpecifier extends ASTNode {
    type: 'ImportSpecifier';
    imported: string;
    local?: string;
}

export interface ExportDeclaration extends Statement {
    type: 'ExportDeclaration';
    declaration: Statement;
}

export interface Program extends ASTNode {
    type: 'Program';
    body: Statement[];
    imports: ImportDeclaration[];
    exports: ExportDeclaration[];
}

export type AnyASTNode = 
    | Expression 
    | Statement 
    | Program 
    | Parameter 
    | ObjectField 
    | FieldDeclaration 
    | CatchClause 
    | ImportSpecifier 
    | TypeAnnotation;

export class ASTFactory {
    static literal(value: any, dataType: 'number' | 'string' | 'boolean' | 'null', position?: any): LiteralExpression {
        return { type: 'LiteralExpression', value, dataType, position };
    }

    static identifier(name: string, position?: any): IdentifierExpression {
        return { type: 'IdentifierExpression', name, position };
    }

    static binary(left: Expression, operator: Token, right: Expression): BinaryExpression {
        return { type: 'BinaryExpression', left, operator, right };
    }

    static unary(operator: Token, operand: Expression): UnaryExpression {
        return { type: 'UnaryExpression', operator, operand };
    }

    static call(callee: Expression, args: Expression[]): CallExpression {
        return { type: 'CallExpression', callee, arguments: args };
    }

    static member(object: Expression, property: Expression, computed: boolean = false): MemberExpression {
        return { type: 'MemberExpression', object, property, computed };
    }

    static objectLiteral(className: string, fields: ObjectField[]): ObjectLiteralExpression {
        return { type: 'ObjectLiteralExpression', className, fields };
    }

    static objectField(key: string, value: Expression): ObjectField {
        return { type: 'ObjectField', key, value };
    }

    static variableDecl(name: string, typeAnnotation?: TypeAnnotation, initializer?: Expression, isConstant: boolean = false): VariableDeclaration {
        return { type: 'VariableDeclaration', name, typeAnnotation, initializer, isConstant };
    }

    static functionDecl(name: string, parameters: Parameter[], returnType: TypeAnnotation | undefined, body: BlockStatement): FunctionDeclaration {
        return { type: 'FunctionDeclaration', name, parameters, returnType, body };
    }

    static classDecl(name: string, fields: FieldDeclaration[], methods: FunctionDeclaration[], superClass?: string): ClassDeclaration {
        return { type: 'ClassDeclaration', name, superClass, fields, methods };
    }

    static block(statements: Statement[]): BlockStatement {
        return { type: 'BlockStatement', statements };
    }

    static ifStmt(condition: Expression, thenBranch: Statement, elseBranch?: Statement): IfStatement {
        return { type: 'IfStatement', condition, thenBranch, elseBranch };
    }

    static whileStmt(condition: Expression, body: Statement): WhileStatement {
        return { type: 'WhileStatement', condition, body };
    }

    static returnStmt(value?: Expression): ReturnStatement {
        return { type: 'ReturnStatement', value };
    }

    static typeAnnotation(name: string, genericArgs?: TypeAnnotation[], nullable?: boolean): TypeAnnotation {
        return { type: 'TypeAnnotation', name, genericArgs, nullable };
    }

    static parameter(name: string, typeAnnotation?: TypeAnnotation, defaultValue?: Expression): Parameter {
        return { type: 'Parameter', name, typeAnnotation, defaultValue };
    }

    static fieldDecl(name: string, typeAnnotation: TypeAnnotation, visibility?: 'public' | 'private' | 'protected', defaultValue?: Expression): FieldDeclaration {
        return { type: 'FieldDeclaration', name, typeAnnotation, visibility, defaultValue };
    }

    static program(body: Statement[], imports: ImportDeclaration[] = [], exports: ExportDeclaration[] = []): Program {
        return { type: 'Program', body, imports, exports };
    }
}