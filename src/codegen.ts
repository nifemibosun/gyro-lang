import { tokenize } from './lexer.js';
import { parse } from './parser.js'

import { OpCode } from './opcodes.js';
import { TokenType } from './lexer.js';
import { TypeInferenceEngine } from './type_inference.js';
import {
    Program, Statement, Expression, ThrowStatement, TryStatement,
    VariableDeclaration, FunctionDeclaration, ClassDeclaration,
    BlockStatement, IfStatement, WhileStatement, ReturnStatement,
    BinaryExpression, UnaryExpression, CallExpression, MemberExpression,
    LiteralExpression, IdentifierExpression, ArrayExpression, ForStatement,
    ObjectLiteralExpression, ExpressionStatement, AssignmentExpression,
} from './ast.js';

export interface CompilationResult {
    bytecode: number[];
    constantPool: any[];
    classes?: any[];
    functions?: any[];
    exceptionHandlers?: any[];
    metadata?: any;
}

interface CompilerContext {
    bytecode: number[];
    constantPool: any[];
    constants: Map<any, number>;

    globals: Map<string, number>;
    locals: Map<string, number>;
    classes: Map<string, any>;
    functions: Map<string, any>;

    currentFunction?: string;
    currentClass?: string;
    localCount: number;
    globalCount: number;

    breakTargets: number[];
    continueTargets: number[];

    exceptionHandlers: any[];
}

export class GyroCodeGenerator {
    private ctx: CompilerContext;
    private typeInference: TypeInferenceEngine;
    private builtInFunctions = new Set(['println', 'input', 'malloc', 'free']);
    private builtInArgCounts: Map<string, number> = new Map([
        ['println', 1],
        ['input', 0],
        ['malloc', 1],
        ['free', 1],
    ]);

    constructor() {
        this.ctx = {
            bytecode: [],
            constantPool: [],
            constants: new Map(),
            globals: new Map(),
            locals: new Map(),
            classes: new Map(),
            functions: new Map(),
            localCount: 0,
            globalCount: 0,
            breakTargets: [],
            continueTargets: [],
            exceptionHandlers: []
        };
        this.typeInference = new TypeInferenceEngine();
    }

    compile(ast: Program): CompilationResult {
        this.collectDeclarations(ast);
        this.validateTypes(ast);

        this.generateProgram(ast);

        return {
            bytecode: this.ctx.bytecode,
            constantPool: this.ctx.constantPool,
            classes: Array.from(this.ctx.classes.values()),
            functions: Array.from(this.ctx.functions.values()),
            exceptionHandlers: this.ctx.exceptionHandlers,
            metadata: {
                version: '0.2.0',
                target: 'gyro-vm',
            }
        };
    }

    public validateTypes(ast: Program): void {
        for (const stmt of ast.body) {
            this.validateStatementTypes(stmt);
        }
    }

    private validateStatementTypes(stmt: Statement): void {
        switch (stmt.type) {
            case 'ExpressionStatement':
                this.validateExpressionTypes((stmt as ExpressionStatement).expression);
                break;
            case 'VariableDeclaration':
                this.validateVariableDeclarationTypes(stmt as VariableDeclaration);
                break;
            case 'FunctionDeclaration':
                this.validateFunctionDeclarationTypes(stmt as FunctionDeclaration);
                break;
            case 'ForStatement':
                this.validateForStatementTypes(stmt as ForStatement);
                break;
        }
    }

    private validateForStatementTypes(node: ForStatement): void {
        if (node.initializer) {
            this.validateStatementTypes(node.initializer);
        }
        if (node.condition) {
            const conditionType = this.typeInference.inferExpressionType(node.condition);
            if (conditionType.name !== 'bool') {
                throw new Error(`For loop condition must be of type 'bool', but got '${conditionType.name}'`);
            }
        }
        if (node.increment) {
            this.validateExpressionTypes(node.increment);
        }
        this.validateStatementTypes(node.body);
    }

    private generateForStatement(node: ForStatement): void {
        const savedLocals = new Map(this.ctx.locals);
        const savedLocalCount = this.ctx.localCount;

        if (node.initializer) {
            this.generateStatement(node.initializer);
        }
        
        const loopStart = this.ctx.bytecode.length;
        this.ctx.continueTargets.push(this.ctx.bytecode.length);
        
        let exitJumpPatch: number | undefined;
        if (node.condition) {
            this.generateExpression(node.condition);
            exitJumpPatch = this.emitJump(OpCode.JZ);
        }
        
        this.ctx.breakTargets.push(exitJumpPatch !== undefined ? exitJumpPatch : -1);

        this.generateStatement(node.body);
        
        if (node.increment) {
            const continueTarget = this.ctx.continueTargets.pop();
            if (continueTarget !== undefined) {
                this.ctx.continueTargets.push(this.ctx.bytecode.length);
            }
            this.generateExpression(node.increment);
            this.emit(OpCode.POP);
        }

        this.emitLoop(loopStart);

        this.patchJump(this.ctx.breakTargets.pop()!);
        this.ctx.continueTargets.pop();

        const localsInScope = this.ctx.localCount - savedLocalCount;
        if (localsInScope > 0) {
            this.emit(OpCode.POP);
            this.emit(localsInScope);
        }

        this.ctx.locals = savedLocals;
        this.ctx.localCount = savedLocalCount;
    }
    
    private validateVariableDeclarationTypes(node: VariableDeclaration): void {
        if (node.initializer) {
            const inferredType = this.typeInference.inferExpressionType(node.initializer);

            if (node.typeAnnotation) {
                const expected = this.normalizeTypeName(node.typeAnnotation.name);
                const actual = this.normalizeTypeName(inferredType.name);

                if (expected !== actual) {
                    throw new Error(
                        `Type mismatch: Cannot assign '${actual}' to variable of type '${expected}'`
                    );
                }
            }
        }

        if (node.typeAnnotation) {
            this.typeInference.registerVariable(node.name, node.typeAnnotation);
        }
    }

    private validateFunctionDeclarationTypes(node: FunctionDeclaration): void {
        // For now, the existing logic in generateFunctionDeclaration is sufficient.
    }

    private validateExpressionTypes(expr: Expression): void {
        switch (expr.type) {
            case 'BinaryExpression':
                this.validateExpressionTypes((expr as BinaryExpression).left);
                this.validateExpressionTypes((expr as BinaryExpression).right);
                break;
            case 'UnaryExpression':
                this.validateExpressionTypes((expr as UnaryExpression).operand);
                break;
            case 'CallExpression':
                this.validateCallExpressionTypes(expr as CallExpression);
                break;
        }
    }

    private validateCallExpressionTypes(node: CallExpression): void {
        if (node.callee.type === 'IdentifierExpression') {
            const funcName = (node.callee as IdentifierExpression).name;
            let expectedParams: { name: string, type: string }[] = [];

            if (this.isBuiltIn(funcName)) {
                this.validateArgumentTypes(funcName, node.arguments);
            } else {
                const funcDef = this.ctx.functions.get(funcName);
                if (!funcDef) {
                    throw new Error(`Unknown function: ${funcName}`);
                }

                expectedParams = funcDef.parameters;

                if (node.arguments.length !== expectedParams.length) {
                    throw new Error(`Function '${funcName}' expects ${expectedParams.length} arguments, but received ${node.arguments.length}`);
                }

                for (let i = 0; i < node.arguments.length; i++) {
                    const arg = node.arguments[i];
                    const param = expectedParams[i];
                    const inferredArgType = this.typeInference.inferExpressionType(arg);

                    if (inferredArgType.name !== param.type) {
                        throw new Error(`Type mismatch in call to '${funcName}': Argument ${i + 1} has type '${inferredArgType.name}' but expected '${param.type}'`);
                    }
                }
            }
        }
    }

    public collectDeclarations(ast: Program): void {
        for (const stmt of ast.body) {
            if (stmt.type === 'ClassDeclaration') {
                this.collectClass(stmt as ClassDeclaration);
            } else if (stmt.type === 'FunctionDeclaration') {
                this.collectFunction(stmt as FunctionDeclaration);
            }
        }
    }

    private collectClass(node: ClassDeclaration): void {
        const classDef = {
            name: node.name,
            fields: node.fields.map(f => f.name),
            methods: [] as any[]
        };

        for (const method of node.methods) {
            classDef.methods.push({
                name: method.name,
                address: 0,
                params: method.parameters.map(p => ({
                    name: p.name,
                    type: p.typeAnnotation?.name || 'any'
                })),
                returnType: method.returnType?.name || 'void'
            });

            this.collectFunction({
                ...method,
                name: `${node.name}_${method.name}`,
            });
        }

        this.ctx.classes.set(node.name, classDef);
    }

    private collectFunction(node: FunctionDeclaration): void {
        const funcDef = {
            name: node.name,
            address: 0,
            localCount: 0,
            parameters: node.parameters.map(p => ({
                name: p.name,
                type: p.typeAnnotation?.name || 'any'
            })),
            returnType: node.returnType?.name || 'void'
        };

        this.ctx.functions.set(node.name, funcDef);
    }

    private generateProgram(ast: Program): void {
        const mainFuncDef = this.ctx.functions.get('main');
        if (!mainFuncDef) {
            throw new Error("Compilation Error: No 'main' function found. The 'main' function is required as the program entry point.");
        }
        
        if (mainFuncDef.parameters.length > 0) {
            throw new Error("Compilation Error: The 'main' function cannot accept any arguments.");
        }

        this.emit(OpCode.CALL);
        const mainCallAddressOffset = this.ctx.bytecode.length;
        this.emit(0xFFFF);
        this.emit(0);
        this.emit(OpCode.HALT);

        for (const stmt of ast.body) {
            if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') {
                this.generateStatement(stmt);
            }
        }

        for (const stmt of ast.body) {
            switch (stmt.type) {
                case 'FunctionDeclaration':
                case 'ClassDeclaration':
                case 'VariableDeclaration':
                    break;
                default:
                    throw new Error(`Unexpected top-level statement of type '${stmt.type}'. All executable code must be inside a function.`);
            }
        }

        const finalMainAddress = this.ctx.functions.get('main')?.address;
        if (finalMainAddress === undefined) {
            throw new Error("Internal Compiler Error: Could not resolve 'main' function address after compilation.");
        }
        
        this.ctx.bytecode[mainCallAddressOffset] = finalMainAddress;
    }

    private generateStatement(stmt: Statement): void {
        switch (stmt.type) {
            case 'VariableDeclaration':
                this.generateVariableDeclaration(stmt as VariableDeclaration);
                break;
            case 'FunctionDeclaration':
                this.generateFunctionDeclaration(stmt as FunctionDeclaration);
                break;
            case 'ClassDeclaration':
                this.generateClassDeclaration(stmt as ClassDeclaration);
                break;
            case 'BreakStatement':
                this.generateBreakStatement();
                break;
            case 'ContinueStatement':
                this.generateContinueStatement();
                break;
            case 'ExpressionStatement':
                const expr = (stmt as ExpressionStatement).expression;
                this.generateExpression(expr);

                if (expr.type !== 'AssignmentExpression' && expr.type !== 'CallExpression') {
                    this.emit(OpCode.POP);
                }
                break;
            case 'BlockStatement':
                this.generateBlockStatement(stmt as BlockStatement);
                break;
            case 'IfStatement':
                this.generateIfStatement(stmt as IfStatement);
                break;
            case 'ForStatement':
                this.generateForStatement(stmt as ForStatement);
                break;
            case 'WhileStatement':
                this.generateWhileStatement(stmt as WhileStatement);
                break;
            case 'ReturnStatement':
                this.generateReturnStatement(stmt as ReturnStatement);
                break;
            case 'TryStatement':
                this.generateTryStatement(stmt as TryStatement);
                break;
            case 'ThrowStatement':
                this.generateThrowStatement(stmt as ThrowStatement);
                break;
            default:
                throw new Error(`Unknown statement type: ${stmt.type}`);
        }
    }

    private generateVariableDeclaration(node: VariableDeclaration): void {
        let actualType = node.typeAnnotation;

        if (node.initializer) {
            this.generateExpression(node.initializer);
            const inferredType = this.typeInference.inferExpressionType(node.initializer);

            if (actualType && actualType.name !== inferredType.name) {
                throw new Error(`Type mismatch: Cannot assign '${inferredType.name}' to variable of type '${actualType.name}'`);
            }

            if (!actualType) {
                actualType = inferredType;
            }
        } else {
            if (!actualType) {
                throw new Error(`Variable '${node.name}' must have type annotation or initializer`);
            }
            this.emit(OpCode.PUSH_NULL);
        }

        this.typeInference.registerVariable(node.name, actualType);

        const globalIndex = this.ctx.globalCount++;
        this.ctx.globals.set(node.name, globalIndex);
        this.emit(OpCode.STORE_GLOBAL);
        this.emit(globalIndex);
    }

    private generateFunctionDeclaration(node: FunctionDeclaration): void {
        this.emit(OpCode.FUN);

        const funcDef = this.ctx.functions.get(node.name);
        if (funcDef) {
            funcDef.address = this.ctx.bytecode.length;
        }

        if (!node.returnType) {
            throw new Error(`Function '${node.name}' must have explicit return type`);
        }

        this.typeInference.registerFunction(node.name, node.returnType);

        this.typeInference.validateFunctionReturnType(node);

        const savedLocals = new Map(this.ctx.locals);
        const savedLocalCount = this.ctx.localCount;
        const savedFunction = this.ctx.currentFunction;

        this.ctx.currentFunction = node.name;
        this.ctx.locals.clear();
        this.ctx.localCount = 0;

        if (this.ctx.currentClass) {
            this.ctx.locals.set('this', this.ctx.localCount++);
        }

        for (let i = 0; i < node.parameters.length; i++) {
            const param = node.parameters[i];
            const localIndex = this.ctx.localCount++;
            this.ctx.locals.set(param.name, localIndex);

            if (param.typeAnnotation) {
                this.typeInference.registerVariable(param.name, param.typeAnnotation);
            }
        }

        this.generateStatement(node.body);

        if (this.ctx.bytecode[this.ctx.bytecode.length - 1] !== OpCode.RET) {
            if (node.returnType.name === 'void') {
                this.emit(OpCode.PUSH_NULL);
                this.emit(OpCode.RET);
            } else {
                throw new Error(`Function '${node.name}' with return type '${node.returnType.name}' must have explicit return statement`);
            }
        }

        if (funcDef) {
            funcDef.localCount = this.ctx.localCount;
        }

        this.ctx.locals = savedLocals;
        this.ctx.localCount = savedLocalCount;
        this.ctx.currentFunction = savedFunction;
    }

    private generateClassDeclaration(node: ClassDeclaration): void {
        for (const method of node.methods) {
            const methodName = `${node.name}_${method.name}`;
            const funcDef = this.ctx.functions.get(methodName) || {
                name: methodName,
                address: this.ctx.bytecode.length,
                params: method.parameters.map(p => p.name),
                returnType: method.returnType?.name || 'void'
            };

            this.ctx.functions.set(methodName, funcDef);
            this.generateFunctionDeclaration(method);
        }
    }

    private generateBlockStatement(node: BlockStatement): void {
        for (const stmt of node.statements) {
            this.generateStatement(stmt);
        }
    }

    private generateIfStatement(node: IfStatement): void {
        this.generateExpression(node.condition);

        const elseJump = this.emitJump(OpCode.JZ);
        this.generateStatement(node.thenBranch);

        if (node.elseBranch) {
            const endJump = this.emitJump(OpCode.JMP);
            this.patchJump(elseJump);
            this.generateStatement(node.elseBranch);
            this.patchJump(endJump);
        } else {
            this.patchJump(elseJump);
        }
    }

    private generateWhileStatement(node: WhileStatement): void {
        const loopStart = this.ctx.bytecode.length;
        this.ctx.continueTargets.push(loopStart);

        this.generateExpression(node.condition);
        const exitJumpPatch = this.emitJump(OpCode.JZ);
        this.ctx.breakTargets.push(exitJumpPatch);

        this.generateStatement(node.body);

        this.emitLoop(loopStart);

        this.patchJump(this.ctx.breakTargets.pop()!);
        this.ctx.continueTargets.pop();
    }

    private generateBreakStatement(): void {
        if (this.ctx.breakTargets.length === 0) {
            throw new Error("Break statement must be inside a loop.");
        }

        const jumpPlaceholderAddress = this.emitJump(OpCode.JMP);
        this.ctx.breakTargets.push(jumpPlaceholderAddress);
    }

    private generateContinueStatement(): void {
        if (this.ctx.continueTargets.length === 0) {
            throw new Error("Continue statement must be inside a loop.");
        }
        const continueTarget = this.ctx.continueTargets[this.ctx.continueTargets.length - 1];
        this.emit(OpCode.JMP);
        this.emit(continueTarget);
    }

    private generateReturnStatement(node: ReturnStatement): void {
        if (node.value) {
            this.generateExpression(node.value);
        } else {
            this.emit(OpCode.PUSH_NULL);
        }
        this.emit(OpCode.RET);
    }

    private generateTryStatement(node: TryStatement): void {
        const tryStart = this.ctx.bytecode.length;

        this.generateStatement(node.body);

        const tryEnd = this.ctx.bytecode.length;
        let catchStart = 0;
        let finallyStart = 0;

        if (node.catchClause) {
            catchStart = this.ctx.bytecode.length;
            this.emit(OpCode.CATCH);

            if (node.catchClause.parameter) {
                const localIndex = this.ctx.localCount++;
                this.ctx.locals.set(node.catchClause.parameter, localIndex);
                this.emit(OpCode.STORE_LOCAL);
                this.emit(localIndex);
            }

            this.generateStatement(node.catchClause.body);
        }

        if (node.finallyBlock) {
            finallyStart = this.ctx.bytecode.length;
            this.generateStatement(node.finallyBlock);
        }

        if (node.catchClause || node.finallyBlock) {
            this.ctx.exceptionHandlers.push({
                tryStart,
                tryEnd,
                catchStart: catchStart || 0,
                finallyStart: finallyStart || 0
            });
        }
    }

    private generateThrowStatement(node: ThrowStatement): void {
        this.generateExpression(node.argument);
        this.emit(OpCode.THROW);
    }

    private normalizeTypeName(type: string): string {
        switch (type) {
            case 'int':
                return 'int';
            case 'uint':
                return 'uint';
            case 'float':
                return 'float';
            case 'bool':
                return 'bool';
            case 'string':
                return 'string';
            case 'void':
                return 'void';
            default:
                return type;
        }
    }

    private generateExpression(expr: Expression): void {
        switch (expr.type) {
            case 'LiteralExpression':
                this.generateLiteral(expr as LiteralExpression);
                break;
            case 'IdentifierExpression':
                this.generateIdentifier(expr as IdentifierExpression);
                break;
            case 'BinaryExpression':
                this.generateBinaryExpression(expr as BinaryExpression);
                break;
            case 'UnaryExpression':
                this.generateUnaryExpression(expr as UnaryExpression);
                break;
            case 'CallExpression':
                this.generateCallExpression(expr as CallExpression);
                break;
            case 'MemberExpression':
                this.generateMemberExpression(expr as MemberExpression);
                break;
            case 'AssignmentExpression':
                this.generateAssignmentExpression(expr as AssignmentExpression);
                break;
            case 'ArrayExpression':
                this.generateArrayExpression(expr as ArrayExpression);
                break;
            case 'ObjectLiteralExpression':
                this.generateObjectLiteral(expr as ObjectLiteralExpression);
                break;
            default:
                throw new Error(`Unknown expression type: ${expr.type}`);
        }
    }

    private generateLiteral(node: LiteralExpression): void {
        switch (node.dataType) {
            case 'number':
                if (Number.isInteger(node.value)) {
                    this.emit(OpCode.PUSH_INT);
                    this.emit(node.value);
                } else {
                    this.emit(OpCode.PUSH_FLOAT);
                    this.emit(node.value);
                }
                break;
            case 'string':
                this.emit(OpCode.PUSH_CONST);
                this.emit(this.addConstant(node.value));
                break;
            case 'boolean':
                this.emit(node.value ? OpCode.PUSH_TRUE : OpCode.PUSH_FALSE);
                break;
            case 'null':
                this.emit(OpCode.PUSH_NULL);
                break;
        }
    }

    private generateIdentifier(node: IdentifierExpression): void {
        const localIndex = this.ctx.locals.get(node.name);
        if (localIndex !== undefined) {
            this.emit(OpCode.LOAD_LOCAL);
            this.emit(localIndex);
        } else {
            const globalIndex = this.ctx.globals.get(node.name);
            if (globalIndex !== undefined) {
                this.emit(OpCode.LOAD_GLOBAL);
                this.emit(globalIndex);
            } else {
                throw new Error(`Undefined variable: ${node.name}`);
            }
        }
    }

    private generateBinaryExpression(node: BinaryExpression): void {
        this.generateExpression(node.left);
        this.generateExpression(node.right);

        switch (node.operator.type) {
            case TokenType.PLUS: this.emit(OpCode.ADD); break;
            case TokenType.MINUS: this.emit(OpCode.SUB); break;
            case TokenType.STAR: this.emit(OpCode.MUL); break;
            case TokenType.SLASH: this.emit(OpCode.DIV); break;
            case TokenType.PERCENT: this.emit(OpCode.MOD); break;
            case TokenType.EQUAL_EQUAL: this.emit(OpCode.EQ); break;
            case TokenType.BANG_EQUAL: this.emit(OpCode.NEQ); break;
            case TokenType.GREATER: this.emit(OpCode.GT); break;
            case TokenType.GREATER_EQUAL: this.emit(OpCode.GTE); break;
            case TokenType.LESS: this.emit(OpCode.LT); break;
            case TokenType.LESS_EQUAL: this.emit(OpCode.LTE); break;
            case TokenType.AND_AND: this.emit(OpCode.AND); break;
            case TokenType.OR_OR: this.emit(OpCode.OR); break;
            default:
                throw new Error(`Unknown binary operator: ${node.operator.type}`);
        }
    }

    private generateUnaryExpression(node: UnaryExpression): void {
        this.generateExpression(node.operand);

        switch (node.operator.type) {
            case TokenType.MINUS: this.emit(OpCode.NEG); break;
            case TokenType.BANG: this.emit(OpCode.NOT); break;
            default:
                throw new Error(`Unknown unary operator: ${node.operator.type}`);
        }
    }

    private generateCallExpression(node: CallExpression): void {
        if (node.callee.type === 'MemberExpression') {
            const member = node.callee as MemberExpression;
            const methodName = (member.property as IdentifierExpression).name;

            if (member.object.type === 'IdentifierExpression' && this.ctx.classes.has((member.object as IdentifierExpression).name)) {
                for (const arg of node.arguments) {
                    this.generateExpression(arg);
                }
                const className = (member.object as IdentifierExpression).name;
                const fullMethodName = `${className}_${methodName}`;
                const funcDef = this.ctx.functions.get(fullMethodName);

                if (funcDef) {
                    this.emit(OpCode.CALL);
                    this.emit(funcDef.address);
                    this.emit(node.arguments.length);
                } else {
                    throw new Error(`Unknown static method: ${className}.${methodName}`);
                }
            } else {
                this.generateExpression(member.object);

                for (const arg of node.arguments) {
                    this.generateExpression(arg);
                }

                this.emit(OpCode.METHOD_CALL);
                this.emit(this.addConstant(methodName));
                this.emit(node.arguments.length);
            }
        } else if (node.callee.type === 'IdentifierExpression') {
            const funcName = (node.callee as IdentifierExpression).name;

            if (this.ctx.functions.has(funcName) || this.isBuiltIn(funcName)) {
                let expectedArgs: number;
                let funcDef;

                if (this.isBuiltIn(funcName)) {
                    expectedArgs = this.getExpectedArgCount(funcName);
                } else {
                    funcDef = this.ctx.functions.get(funcName);
                    if (!funcDef) {
                        throw new Error(`Unknown function: ${funcName}`);
                    }
                    expectedArgs = funcDef.parameters.length;
                }

                if (node.arguments.length !== expectedArgs) {
                    throw new Error(`Function '${funcName}' expects ${expectedArgs} arguments, but received ${node.arguments.length}`);
                }

                for (const arg of node.arguments) {
                    this.generateExpression(arg);
                }

                if (this.isBuiltIn(funcName)) {
                    switch (funcName) {
                        case 'println':
                            this.emit(OpCode.PRINT_LN);
                            break;
                        case 'input':
                            this.emit(OpCode.INPUT);
                            break;
                        case 'malloc':
                            this.emit(OpCode.MALLOC);
                            break;
                        case 'free':
                            this.emit(OpCode.FREE);
                            break;
                    }
                } else {
                    this.emit(OpCode.CALL);
                    this.emit(funcDef.address);
                    this.emit(node.arguments.length);
                }
            } else {
                throw new Error(`Unknown function: ${funcName}`);
            }
        }
    }

    private generateMemberExpression(node: MemberExpression): void {
        this.generateExpression(node.object);

        if (node.computed) {
            this.generateExpression(node.property);
            this.emit(OpCode.ARRAY_GET);
        } else {
            const fieldName = (node.property as IdentifierExpression).name;
            this.emit(OpCode.FIELD_GET);
            this.emit(this.addConstant(fieldName));
        }
    }

    private generateAssignmentExpression(node: AssignmentExpression): void {
        if (node.target.type === 'IdentifierExpression') {
            const name = (node.target as IdentifierExpression).name;
            const localIndex = this.ctx.locals.get(name);
            const globalIndex = this.ctx.globals.get(name);

            this.generateExpression(node.value);

            if (localIndex !== undefined) {
                this.emit(OpCode.STORE_LOCAL);
                this.emit(localIndex);
            } else if (globalIndex !== undefined) {
                this.emit(OpCode.STORE_GLOBAL);
                this.emit(globalIndex);
            } else {
                throw new Error(`Undefined variable: ${name}`);
            }
        } else if (node.target.type === 'MemberExpression') {
            const member = node.target as MemberExpression;
            this.generateExpression(member.object);

            if (member.computed) {
                this.generateExpression(member.property);
                this.generateExpression(node.value);
                this.emit(OpCode.ARRAY_SET);
            } else {
                const fieldName = (member.property as IdentifierExpression).name;
                this.emit(OpCode.PUSH_CONST);
                this.emit(this.addConstant(fieldName));
                this.generateExpression(node.value);
                this.emit(OpCode.FIELD_SET);
            }
        }
    }

    private generateArrayExpression(node: ArrayExpression): void {
        this.emit(OpCode.PUSH_INT);
        this.emit(node.elements.length);
        this.emit(OpCode.ARRAY_CREATE);

        for (let i = 0; i < node.elements.length; i++) {
            this.emit(OpCode.DUP);
            this.emit(OpCode.PUSH_INT);
            this.emit(i);
            this.generateExpression(node.elements[i]);
            this.emit(OpCode.ARRAY_SET);
        }
    }

    private generateObjectLiteral(node: ObjectLiteralExpression): void {
        this.emit(OpCode.PUSH_CONST);
        this.emit(this.addConstant(node.className));
        this.emit(OpCode.OBJECT_NEW);

        for (const field of node.fields) {
            this.emit(OpCode.DUP);
            this.emit(OpCode.PUSH_CONST);
            this.emit(this.addConstant(field.key));
            this.generateExpression(field.value);
            this.emit(OpCode.FIELD_SET);
        }
    }


    private isBuiltIn(funcName: string): boolean {
        return this.builtInFunctions.has(funcName);
    }

    private getExpectedArgCount(funcName: string): number {
        const count = this.builtInArgCounts.get(funcName);
        return count !== undefined ? count : -1;
    }

    private validateArgumentTypes(funcName: string, args: Expression[]): void {
        if (funcName === 'println') {
            if (args.length === 1) {
                const argType = this.typeInference.inferExpressionType(args[0]);
                const validTypes = new Set(['int', 'float', 'string', 'bool', 'any']);
                if (!validTypes.has(argType.name)) {
                    throw new Error(`Type mismatch in 'println()': Argument of type '${argType.name}' is not printable.`);
                }
            }
        } else if (funcName === 'malloc') {
            if (args.length === 1) {
                const argType = this.typeInference.inferExpressionType(args[0]);
                if (argType.name !== 'int') {
                    throw new Error(`Type mismatch in 'malloc()': Expected 'int', but received '${argType.name}'`);
                }
            }
        } else if (funcName === 'free') {
            if (args.length === 1) {
                const argType = this.typeInference.inferExpressionType(args[0]);
                if (
                    argType.name === 'void' ||
                    argType.name === 'int' ||
                    argType.name === 'float' ||
                    argType.name === 'string' ||
                    argType.name === 'bool'
                ) {
                    throw new Error(
                        `Type mismatch in 'free()': Cannot free a primitive type '${argType.name}'.`
                    );
                }
            }
        }
    }
    private emit(opcode: OpCode | number): void {
        this.ctx.bytecode.push(opcode);
    }

    private addConstant(value: any): number {
        const existing = this.ctx.constants.get(value);
        if (existing !== undefined) {
            return existing;
        }

        const index = this.ctx.constantPool.length;
        this.ctx.constantPool.push(value);
        this.ctx.constants.set(value, index);
        return index;
    }

    private emitJump(op: OpCode): number {
        this.emit(op);
        this.emit(0xFF);
        return this.ctx.bytecode.length - 1;
    }

    private patchJump(address: number): void {
        const jump = this.ctx.bytecode.length;
        this.ctx.bytecode[address] = jump;
    }

    private emitLoop(loopStart: number): void {
        this.emit(OpCode.JMP);
        this.emit(loopStart);
    }
}

export function compile(source: string): CompilationResult {
    try {
        const tokens = tokenize(source);
        const ast = parse(tokens);
        const codegen = new GyroCodeGenerator();

        return codegen.compile(ast);
    } catch (error) {
        throw new Error(`Compilation failed: ${(error as Error).message}`);
    }
}