import { OpCode } from './opcodes.js';
import {
    ProgramNode, StatementNode, ExpressionNode, FunctionDeclarationNode,
    VariableDeclarationNode, ReturnStatementNode, IfStatementNode, WhileStatementNode,
    BlockStatementNode, ExpressionStatementNode, BinaryExpressionNode, UnaryExpressionNode,
    CallExpressionNode, IdentifierNode, LiteralNode, NodeType, BaseNode,
    AssignmentExpressionNode, TernaryExpressionNode, MemberExpressionNode
} from './ast.js';

export interface CompiledOutput {
    bytecode: number[];
    constantPool: any[];
}

interface FunctionInfo {
    address: number;
    arity: number;
    numLocals: number;
}

class LocalScope {
    parent: LocalScope | null;
    variables: Map<string, number>;
    nextLocalOffset: number;

    constructor(parent: LocalScope | null = null, initialOffset: number = 0) {
        this.parent = parent;
        this.variables = new Map();
        this.nextLocalOffset = initialOffset;
    }

    define(name: string): number {
        if (this.variables.has(name)) {
            throw new Error(`Redeclaration of '${name}' in the same scope.`);
        }
        const offset = this.nextLocalOffset++;
        this.variables.set(name, offset);
        return offset;
    }

    resolve(name: string): { offset: number; isLocal: boolean } | undefined {
        if (this.variables.has(name)) {
            return { offset: this.variables.get(name)!, isLocal: true };
        }
        return this.parent?.resolve(name);
    }
}

class CodeGenerator {
    private bytecode: number[] = [];
    private constantPool: any[] = [];
    private globalFunctions: Map<string, FunctionInfo> = new Map();
    private currentScope: LocalScope | null = null;

    private addConstant(value: any): number {
        const index = this.constantPool.findIndex(c => JSON.stringify(c) === JSON.stringify(value));
        if (index >= 0) return index;
        this.constantPool.push(value);
        return this.constantPool.length - 1;
    }

    private emit(...bytes: number[]) {
        this.bytecode.push(...bytes);
    }

    private patchJump(at: number, to: number = this.bytecode.length) {
        this.bytecode[at] = to;
    }

    private visit(node: any): void {
        switch (node.type) {
            case NodeType.Program: this.visitProgram(node);
            case NodeType.FunctionDeclaration: this.visitFunctionDeclaration(node);
            case NodeType.VariableDeclaration: this.visitVariableDeclaration(node);
            case NodeType.ReturnStatement: this.visitReturnStatement(node);
            case NodeType.IfStatement: this.visitIfStatement(node);
            case NodeType.WhileStatement: this.visitWhileStatement(node);
            case NodeType.BlockStatement: this.visitBlockStatement(node);
            case NodeType.ExpressionStatement: this.visitExpressionStatement(node);
            case NodeType.BinaryExpression: this.visitBinaryExpression(node);
            case NodeType.UnaryExpression: this.visitUnaryExpression(node);
            case NodeType.CallExpression: this.visitCallExpression(node);
            case NodeType.Identifier: this.visitIdentifier(node);
            case NodeType.Literal: this.visitLiteral(node);
            case NodeType.AssignmentExpression: this.visitAssignmentExpression(node);
            case NodeType.TernaryExpression: this.visitTernaryExpression(node);
            case NodeType.MemberExpression: this.visitMemberExpression(node);
            default:
                throw new Error(`Unhandled node type: ${node.type}`);
        }
    }

    private visitProgram(node: ProgramNode) {
        for (const stmt of node.body) {
            if (stmt.type === NodeType.FunctionDeclaration) {
                const name = stmt.name.value;
                this.globalFunctions.set(name, { address: -1, arity: stmt.params.length, numLocals: 0 });
            }
        }
        for (const stmt of node.body) {
            this.visit(stmt);
        }
        if (!this.bytecode.length || ![OpCode.RET, OpCode.HALT].includes(this.bytecode.at(-1)!)) {
            this.emit(OpCode.HALT);
        }
    }

    private visitFunctionDeclaration(node: FunctionDeclarationNode) {
        const info = this.globalFunctions.get(node.name.value)!;
        info.address = this.bytecode.length;
        this.currentScope = new LocalScope(null, 0);
        node.params.forEach(p => this.currentScope!.define(p.value));
        this.visit(node.body);
        if (this.bytecode.at(-1) !== OpCode.RET) {
            this.emit(OpCode.PUSH_NULL, OpCode.RET);
        }
        info.numLocals = this.currentScope.nextLocalOffset;
        this.currentScope = null;
    }

    private visitVariableDeclaration(node: VariableDeclarationNode) {
        const offset = this.currentScope!.define(node.name.value);
        if (node.initializer) {
            this.visit(node.initializer);
        } else {
            this.emit(OpCode.PUSH_NULL);
        }
        this.emit(OpCode.STORE_LOCAL, offset);
    }

    private visitReturnStatement(node: ReturnStatementNode) {
        if (node.argument) this.visit(node.argument);
        else this.emit(OpCode.PUSH_NULL);
        this.emit(OpCode.RET);
    }

    private visitIfStatement(node: IfStatementNode) {
        this.visit(node.test);
        this.emit(OpCode.JZ);
        const jzIndex = this.bytecode.length;
        this.emit(0);
        this.visit(node.consequent);
        if (node.alternate) {
            this.emit(OpCode.JMP);
            const jmpIndex = this.bytecode.length;
            this.emit(0);
            this.patchJump(jzIndex);
            this.visit(node.alternate);
            this.patchJump(jmpIndex);
        } else {
            this.patchJump(jzIndex);
        }
    }

    private visitWhileStatement(node: WhileStatementNode) {
        const loopStart = this.bytecode.length;
        this.visit(node.test);
        this.emit(OpCode.JZ);
        const exitJump = this.bytecode.length;
        this.emit(0);
        this.visit(node.body);
        this.emit(OpCode.JMP, loopStart);
        this.patchJump(exitJump);
    }

    private visitBlockStatement(node: BlockStatementNode) {
        const previous = this.currentScope;
        this.currentScope = new LocalScope(previous, previous?.nextLocalOffset ?? 0);
        node.body.forEach(stmt => this.visit(stmt));
        this.currentScope = previous;
    }

    private visitExpressionStatement(node: ExpressionStatementNode) {
        this.visit(node.expression);
        this.emit(OpCode.POP);
    }

    private visitBinaryExpression(node: BinaryExpressionNode) {
        this.visit(node.left);
        this.visit(node.right);
        const map: Record<string, number> = {
            '+': OpCode.ADD, '-': OpCode.SUB, '*': OpCode.MUL, '/': OpCode.DIV, '%': OpCode.MOD,
            '==': OpCode.EQ, '!=': OpCode.NEQ, '>': OpCode.GT, '>=': OpCode.GTE, '<': OpCode.LT, '<=': OpCode.LTE,
            '&&': OpCode.AND, '||': OpCode.OR
        };
        const opcode = map[node.operator];
        if (opcode === undefined) throw new Error(`Unknown binary operator '${node.operator}'`);
        this.emit(opcode);
    }

    private visitUnaryExpression(node: UnaryExpressionNode) {
        this.visit(node.argument);
        const op = node.operator === '-' ? OpCode.NEG : node.operator === '!' ? OpCode.NOT : null;
        if (op == null) throw new Error(`Unknown unary operator '${node.operator}'`);
        this.emit(op);
    }

    private visitCallExpression(node: CallExpressionNode) {
        if (node.callee.type !== NodeType.Identifier) throw new Error(`Invalid callee`);
        const name = node.callee.value;
        node.args.forEach(arg => this.visit(arg));
        if (name === 'print') {
            this.emit(OpCode.PRINT, OpCode.PUSH_NULL);
        } else {
            const fn = this.globalFunctions.get(name);
            if (!fn) throw new Error(`Undefined function '${name}'`);
            if (node.args.length !== fn.arity) throw new Error(`Wrong arg count for '${name}'`);
            this.emit(OpCode.CALL, fn.address, fn.arity);
        }
    }

    private visitIdentifier(node: IdentifierNode) {
        const resolved = this.currentScope!.resolve(node.value);
        if (!resolved) throw new Error(`Undefined variable '${node.value}'`);
        this.emit(OpCode.LOAD_LOCAL, resolved.offset);
    }

    private visitLiteral(node: LiteralNode) {
        const val = node.value;
        if (typeof val === 'number' && Number.isInteger(val) && val >= -128 && val <= 127) {
            this.emit(OpCode.PUSH_INT, val);
        } else if (typeof val === 'boolean') {
            this.emit(val ? OpCode.PUSH_TRUE : OpCode.PUSH_FALSE);
        } else if (val === null) {
            this.emit(OpCode.PUSH_NULL);
        } else {
            const index = this.addConstant(val);
            this.emit(OpCode.PUSH_CONST, index);
        }
    }

    private visitAssignmentExpression(node: AssignmentExpressionNode) {
        if (node.left.type !== NodeType.Identifier) throw new Error(`Invalid assignment target.`);
        const name = (node.left as IdentifierNode).value;
        this.visit(node.right);
        const resolved = this.currentScope!.resolve(name);
        if (!resolved) throw new Error(`Undefined variable '${name}'`);
        this.emit(OpCode.STORE_LOCAL, resolved.offset);
    }

    private visitTernaryExpression(node: TernaryExpressionNode) {
        this.visit(node.test);
        this.emit(OpCode.JZ);
        const falseJump = this.bytecode.length;
        this.emit(0);
        this.visit(node.consequent);
        this.emit(OpCode.JMP);
        const endJump = this.bytecode.length;
        this.emit(0);
        this.patchJump(falseJump);
        this.visit(node.alternate);
        this.patchJump(endJump);
    }

    private visitMemberExpression(node: MemberExpressionNode) {
        throw new Error(`MemberExpression not implemented yet`);
    }

    public generate(ast: ProgramNode): CompiledOutput {
        this.bytecode = [];
        this.constantPool = [];
        this.globalFunctions = new Map();
        this.currentScope = new LocalScope(null, 0);
        this.visit(ast);
        return { bytecode: this.bytecode, constantPool: this.constantPool };
    }
}

import { tokenize } from './lexer.js';
import { Parser } from './parser.js';

export function compile(source: string): CompiledOutput {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const generator = new CodeGenerator();
    return generator.generate(ast);
}
