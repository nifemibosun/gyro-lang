import { tokenize } from './lexer.js';
import { ASTFactory } from './ast.js';
import { parse } from './parser.js'
import { OpCode } from './opcodes.js';
import { TokenType } from './lexer.js';
import { TypeInferenceEngine } from './type_inference.js';
import type {
    Program, Statement, Expression, ThrowStatement, TryStatement,
    VariableDeclaration, FunctionDeclaration, ClassDeclaration,
    BlockStatement, IfStatement, WhileStatement, ReturnStatement,
    BinaryExpression, UnaryExpression, CallExpression, MemberExpression,
    LiteralExpression, IdentifierExpression, ArrayExpression, ForStatement,
    ObjectLiteralExpression, ExpressionStatement, AssignmentExpression, ImportStatement, TypeAnnotation,
} from './ast.js';


export interface CompilationResult {
    metadata?: any;
    bytecode: number[];
    constantPool: any[];
    classes?: any[];
    functions?: any[];
    exceptionHandlers?: any[];
}

interface LoopContext {
    breakPatches: number[];
    continuePatches: number[];
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

    loopStack: LoopContext[];

    exceptionHandlers: any[];
}

export class GyroCodeGenerator {
    private ctx: CompilerContext;
    private typeInference: TypeInferenceEngine;
    private readonly functionCallPatches: Array<{ operandIndex: number; functionName: string }> = [];
    private readonly builtInArgCounts = new Map<string, number>([
        ['print', 1], ['println', 1], ['input', 0],
        ['malloc', 1], ['free', 1], ['len', 1], ['str', 1],
        ['int', 1], ['float', 1], ['typeOf', 1], ['assert', 1],
        ['abs', 1], ['floor', 1], ['ceil', 1], ['round', 1], ['sqrt', 1],
        ['pow', 2], ['min', 2], ['max', 2], ['sin', 1], ['cos', 1],
        ['tan', 1], ['log', 1], ['exp', 1], ['random', 0],
        ['stringLength', 1], ['stringCharAt', 2], ['stringSubstring', 3],
        ['stringIndexOf', 2], ['stringContains', 2], ['stringStartsWith', 2],
        ['stringEndsWith', 2], ['stringReplace', 3], ['stringSplit', 2],
        ['stringToInt', 1], ['stringToFloat', 1],
        ['arrayLength', 1], ['arrayPush', 2], ['arrayPop', 1],
        ['arrayJoin', 2], ['arrayIncludes', 2],
    ]);

    private readonly standardModules: Record<string, Record<string, string>> = {
        'std/io': { print: 'print', println: 'println', input: 'input' },
        'std/math': {
            abs: 'abs', floor: 'floor', ceil: 'ceil', round: 'round', sqrt: 'sqrt',
            pow: 'pow', min: 'min', max: 'max', sin: 'sin', cos: 'cos', tan: 'tan',
            log: 'log', exp: 'exp', random: 'random',
        },
        'std/string': {
            length: 'stringLength', charAt: 'stringCharAt', substring: 'stringSubstring',
            indexOf: 'stringIndexOf', contains: 'stringContains',
            startsWith: 'stringStartsWith', endsWith: 'stringEndsWith',
            replace: 'stringReplace', split: 'stringSplit', toInt: 'stringToInt',
            toFloat: 'stringToFloat',
        },
        'std/array': {
            length: 'arrayLength', push: 'arrayPush', pop: 'arrayPop',
            join: 'arrayJoin', includes: 'arrayIncludes',
        },
    };

    private readonly moduleNamespaces = new Map<string, string>();
    private readonly builtinAliases = new Map<string, string>();

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
            loopStack: [],
            exceptionHandlers: []
        };
        this.typeInference = new TypeInferenceEngine();
    }

    compile(ast: Program): CompilationResult {
        this.collectDeclarations(ast);
        this.validateTypes(ast);
        this.generateProgram(ast);

        return {
            metadata: {
                version: '0.3.0',
                target: 'gyro-vm',
                createdBy: 'gyro-compiler',
                timestamp: new Date().toISOString(),
            },
            bytecode: this.ctx.bytecode,
            constantPool: this.ctx.constantPool,
            classes: Array.from(this.ctx.classes.values()),
            functions: Array.from(this.ctx.functions.values()),
            exceptionHandlers: this.ctx.exceptionHandlers,
        };
    }

    private validateTypes(ast: Program): void {
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
        this.typeInference.enterScope();

        if (node.initializer) this.generateStatement(node.initializer);

        const loopStart = this.ctx.bytecode.length;
        let exitJumpPatch: number | undefined;
        if (node.condition) {
            this.generateExpression(node.condition);
            exitJumpPatch = this.emitJump(OpCode.JZ);
        }

        const loop: LoopContext = { breakPatches: [], continuePatches: [] };
        this.ctx.loopStack.push(loop);
        this.generateStatement(node.body);

        const continueTarget = this.ctx.bytecode.length;
        for (const patch of loop.continuePatches) this.patchJump(patch, continueTarget);
        if (node.increment) {
            this.generateExpression(node.increment);
            // Assignment expressions update their target without leaving a value on
            // the stack. Other increment expressions must have their value discarded.
            if (node.increment.type !== 'AssignmentExpression') this.emit(OpCode.POP);
        }

        this.emitLoop(loopStart);
        const loopEnd = this.ctx.bytecode.length;
        if (exitJumpPatch !== undefined) this.patchJump(exitJumpPatch, loopEnd);
        for (const patch of loop.breakPatches) this.patchJump(patch, loopEnd);
        this.ctx.loopStack.pop();

        const localsInScope = this.ctx.localCount - savedLocalCount;
        for (let i = 0; i < localsInScope; i++) this.emit(OpCode.POP);
        this.ctx.locals = savedLocals;
        this.ctx.localCount = savedLocalCount;
        this.typeInference.exitScope();
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

    private nativeReturnType(nativeName: string): string {
        if (['print', 'println', 'assert', 'free'].includes(nativeName)) return 'void';
        if (nativeName === 'input' || nativeName === 'str' || nativeName === 'typeOf'
            || nativeName.startsWith('stringCharAt') || nativeName === 'stringSubstring'
            || nativeName === 'stringReplace' || nativeName === 'arrayJoin') return 'string';
        if (['len', 'int', 'stringLength', 'stringIndexOf', 'stringToInt', 'arrayLength', 'arrayPush'].includes(nativeName)) return 'int';
        if (nativeName === 'stringSplit') return 'array';
        if (['stringContains', 'stringStartsWith', 'stringEndsWith', 'arrayIncludes'].includes(nativeName)) return 'bool';
        if (['float', 'stringToFloat', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'pow', 'min', 'max', 'sin', 'cos', 'tan', 'log', 'exp', 'random'].includes(nativeName)) return 'float';
        return 'any';
    }

    public collectDeclarations(ast: Program): void {
        this.moduleNamespaces.clear();
        this.builtinAliases.clear();

        // Resolve the standard-library import declarations before collecting callable declarations.
        for (const stmt of ast.body) {
            if (stmt.type !== 'ImportStatement') continue;
            const importStmt = stmt as ImportStatement;
            const moduleName = importStmt.source.replace(/\\/g, '/').replace(/\.gyro$/, '');
            const exports = this.standardModules[moduleName];
            if (!exports) {
                throw new Error(
                    `Unsupported module '${importStmt.source}'. Available modules: ${Object.keys(this.standardModules).join(', ')}`
                );
            }

            for (const specifier of importStmt.specifiers) {
                if (specifier.isNamespace) {
                    const local = specifier.local ?? specifier.imported;
                    this.moduleNamespaces.set(local, moduleName);
                    for (const [exportedName, nativeName] of Object.entries(exports)) {
                        this.typeInference.registerFunction(
                            `${local}.${exportedName}`,
                            ASTFactory.typeAnnotation(this.nativeReturnType(nativeName)),
                        );
                    }
                    continue;
                }

                const nativeName = exports[specifier.imported];
                if (!nativeName) {
                    throw new Error(`Module '${moduleName}' does not export '${specifier.imported}'`);
                }
                const local = specifier.local ?? specifier.imported;
                if (this.builtinAliases.has(local)) {
                    throw new Error(`Duplicate import binding '${local}'`);
                }
                this.builtinAliases.set(local, nativeName);
                this.typeInference.registerFunction(local, ASTFactory.typeAnnotation(this.nativeReturnType(nativeName)));
            }
        }

        // Reserve global slots before compiling function bodies so functions may refer to
        // globals declared later in the source file.
        for (const stmt of ast.body) {
            if (stmt.type !== 'VariableDeclaration') continue;
            const variable = stmt as VariableDeclaration;
            if (this.ctx.globals.has(variable.name)) {
                throw new Error(`Duplicate global variable '${variable.name}'.`);
            }
            this.ctx.globals.set(variable.name, this.ctx.globalCount++);
            const inferred = variable.typeAnnotation
                ?? (variable.initializer ? this.typeInference.inferExpressionType(variable.initializer) : undefined);
            if (inferred) this.typeInference.registerVariable(variable.name, inferred);
        }

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

            this.collectFunction({ ...method, name: `${node.name}_${method.name}` });
        }

        this.ctx.classes.set(node.name, classDef);
    }

    private collectFunction(node: FunctionDeclaration): void {
        this.typeInference.registerFunction(
            node.name,
            node.returnType ?? ASTFactory.typeAnnotation('any'),
        );
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
            throw new Error("Compilation Error: 'main' function is required as the program entry point.");
        }
        if (mainFuncDef.parameters.length > 0) {
            throw new Error("Compilation Error: The 'main' function cannot accept arguments.");
        }

        // The entry jump skips over function bodies to their startup/global-initializer section.
        // This lets top-level initializers call functions whose addresses are known by then.
        const entryJumpPatch = this.emitJump(OpCode.JMP);

        for (const stmt of ast.body) {
            if (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') {
                this.generateStatement(stmt);
            }
        }

        const globalInitAddress = this.ctx.bytecode.length;
        this.patchJump(entryJumpPatch, globalInitAddress);

        for (const stmt of ast.body) {
            if (stmt.type === 'VariableDeclaration') {
                this.generateVariableDeclaration(stmt as VariableDeclaration);
            }
        }

        this.emit(OpCode.CALL);
        const mainCallAddressOffset = this.ctx.bytecode.length;
        this.emit(0xFF);
        this.emit(0xFF);
        this.emit(0);
        this.emit(OpCode.EXIT);

        const mainAddress = this.ctx.functions.get('main')?.address;
        if (mainAddress === undefined) {
            throw new Error("Internal Compiler Error: Could not resolve 'main' function address.");
        }
        this.ctx.bytecode[mainCallAddressOffset] = (mainAddress >> 8) & 0xFF;
        this.ctx.bytecode[mainCallAddressOffset + 1] = mainAddress & 0xFF;

        for (const stmt of ast.body) {
            switch (stmt.type) {
                case 'ImportStatement':
                case 'VariableDeclaration':
                case 'FunctionDeclaration':
                case 'ClassDeclaration':
                    break;
                default:
                    throw new Error(`Unexpected top-level statement of type '${stmt.type}'`);
            }
        }

        this.patchFunctionCalls();
    }

    private generateStatement(stmt: Statement): void {
        switch (stmt.type) {
            case 'ImportStatement':
                this.generateImportStatement(stmt as any);
                break;
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

                if (expr.type !== 'AssignmentExpression') {
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

    private generateImportStatement(_node: ImportStatement): void {
        // Standard-library imports are resolved before bytecode generation.
    }

    private generateVariableDeclaration(node: VariableDeclaration): void {
        let actualType = node.typeAnnotation;

        if (node.initializer) {
            this.generateExpression(node.initializer);
            const inferredType = this.typeInference.inferExpressionType(node.initializer);

            if (actualType && inferredType.name !== 'any' && actualType.name !== inferredType.name) {
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

        if (this.ctx.currentFunction) {
            const localIndex = this.ctx.localCount++;
            this.ctx.locals.set(node.name, localIndex);
            this.emit(OpCode.STORE_LOCAL);
            this.emit(localIndex);
        } else {
            let globalIndex = this.ctx.globals.get(node.name);
            if (globalIndex === undefined) {
                globalIndex = this.ctx.globalCount++;
                this.ctx.globals.set(node.name, globalIndex);
            }
            this.emit(OpCode.STORE_GLOBAL);
            this.emit(globalIndex);
        }
    }

    private generateFunctionDeclaration(node: FunctionDeclaration): void {
        const funcDef = this.ctx.functions.get(node.name);
        if (funcDef) {
            funcDef.address = this.ctx.bytecode.length;
        }

        if (!node.returnType) {
            throw new Error(`Function '${node.name}' must have explicit return type`);
        }

        this.typeInference.registerFunction(node.name, node.returnType);

        const savedLocals = new Map(this.ctx.locals);
        const savedLocalCount = this.ctx.localCount;
        const savedFunction = this.ctx.currentFunction;

        this.ctx.currentFunction = node.name;
        this.ctx.locals.clear();
        this.ctx.localCount = 0;
        this.typeInference.enterScope();

        if (this.ctx.currentClass) {
            const receiverIndex = this.ctx.localCount++;
            this.ctx.locals.set('this', receiverIndex);
            this.ctx.locals.set('self', receiverIndex);
            this.typeInference.registerVariable('this', ASTFactory.typeAnnotation(this.ctx.currentClass));
            this.typeInference.registerVariable('self', ASTFactory.typeAnnotation(this.ctx.currentClass));
        }

        for (let i = 0; i < node.parameters.length; i++) {
            const param = node.parameters[i];
            const localIndex = this.ctx.localCount++;
            this.ctx.locals.set(param.name, localIndex);

            if (param.typeAnnotation) {
                this.typeInference.registerVariable(param.name, param.typeAnnotation);
            }
        }

        this.typeInference.validateFunctionReturnType(node);
        this.generateStatement(node.body);

        if (node.returnType.name === 'void') {
            // A block emits local cleanup after return statements, so checking the last
            // opcode is not reliable. Every void function gets a safe fall-through return.
            this.emit(OpCode.PUSH_NULL);
            this.emit(OpCode.RET);
        } else if (!this.definitelyReturns(node.body)) {
            throw new Error(`Function '${node.name}' with return type '${node.returnType.name}' must return a value on every path`);
        }

        if (funcDef) {
            funcDef.localCount = this.ctx.localCount;
        }

        this.typeInference.exitScope();
        this.ctx.locals = savedLocals;
        this.ctx.localCount = savedLocalCount;
        this.ctx.currentFunction = savedFunction;
    }

    private definitelyReturns(stmt: Statement): boolean {
        switch (stmt.type) {
            case 'ReturnStatement':
                return true;
            case 'BlockStatement': {
                const block = stmt as BlockStatement;
                return block.statements.some(child => this.definitelyReturns(child));
            }
            case 'IfStatement': {
                const branch = stmt as IfStatement;
                return !!branch.elseBranch && this.definitelyReturns(branch.thenBranch) && this.definitelyReturns(branch.elseBranch);
            }
            case 'TryStatement': {
                const tryStmt = stmt as TryStatement;
                return this.definitelyReturns(tryStmt.body)
                    && (!tryStmt.catchClause || this.definitelyReturns(tryStmt.catchClause.body));
            }
            default:
                return false;
        }
    }

    private generateClassDeclaration(node: ClassDeclaration): void {
        const classDef = this.ctx.classes.get(node.name);
        const previousClass = this.ctx.currentClass;
        this.ctx.currentClass = node.name;

        for (const method of node.methods) {
            const methodName = `${node.name}_${method.name}`;
            const qualifiedMethod = { ...method, name: methodName };
            const funcDef = this.ctx.functions.get(methodName);
            if (!funcDef) throw new Error(`Missing method declaration '${methodName}'`);

            this.generateFunctionDeclaration(qualifiedMethod);
            const classMethod = classDef?.methods.find((entry: any) => entry.name === method.name);
            if (classMethod) classMethod.address = funcDef.address;
        }

        this.ctx.currentClass = previousClass;
    }

    private generateBlockStatement(node: BlockStatement): void {
        const savedLocals = new Map(this.ctx.locals);
        const savedLocalCount = this.ctx.localCount;
        this.typeInference.enterScope();

        try {
            for (const stmt of node.statements) {
                this.generateStatement(stmt);
            }

            const localsInScope = this.ctx.localCount - savedLocalCount;
            for (let i = 0; i < localsInScope; i++) this.emit(OpCode.POP);
        } finally {
            this.ctx.locals = savedLocals;
            this.ctx.localCount = savedLocalCount;
            this.typeInference.exitScope();
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
        this.generateExpression(node.condition);
        const exitJumpPatch = this.emitJump(OpCode.JZ);
        const loop: LoopContext = { breakPatches: [], continuePatches: [] };
        this.ctx.loopStack.push(loop);

        this.generateStatement(node.body);
        for (const patch of loop.continuePatches) this.patchJump(patch, loopStart);
        this.emitLoop(loopStart);

        const loopEnd = this.ctx.bytecode.length;
        this.patchJump(exitJumpPatch, loopEnd);
        for (const patch of loop.breakPatches) this.patchJump(patch, loopEnd);
        this.ctx.loopStack.pop();
    }

    private generateBreakStatement(): void {
        const loop = this.ctx.loopStack[this.ctx.loopStack.length - 1];
        if (!loop) throw new Error("Break statement must be inside a loop.");
        loop.breakPatches.push(this.emitJump(OpCode.JMP));
    }

    private generateContinueStatement(): void {
        const loop = this.ctx.loopStack[this.ctx.loopStack.length - 1];
        if (!loop) throw new Error("Continue statement must be inside a loop.");
        loop.continuePatches.push(this.emitJump(OpCode.JMP));
    }

    private generateReturnStatement(node: ReturnStatement): void {
        const declaredReturnType = this.ctx.currentFunction
            ? this.ctx.functions.get(this.ctx.currentFunction)?.returnType
            : undefined;

        if (declaredReturnType === 'void' && node.value) {
            throw new Error(`Void function '${this.ctx.currentFunction}' cannot return a value.`);
        }
        if (declaredReturnType && declaredReturnType !== 'void' && !node.value) {
            throw new Error(`Function '${this.ctx.currentFunction}' must return a value of type '${declaredReturnType}'.`);
        }

        if (node.value) {
            const actual = this.typeInference.inferExpressionType(node.value).name;
            const expected = declaredReturnType ?? 'any';
            if (actual !== 'any' && expected !== 'any'
                && this.normalizeTypeName(actual) !== this.normalizeTypeName(expected)) {
                throw new Error(`Return type mismatch in '${this.ctx.currentFunction}': expected '${expected}', got '${actual}'.`);
            }
            this.generateExpression(node.value);
        } else {
            this.emit(OpCode.PUSH_NULL);
        }
        this.emit(OpCode.RET);
    }

    private generateTryStatement(node: TryStatement): void {
        const tryStart = this.ctx.bytecode.length;
        this.generateStatement(node.body);
        const tryEnd = this.ctx.bytecode.length - 1;
        const normalJump = this.emitJump(OpCode.JMP);

        let catchStart: number | undefined;
        let catchBodyStart: number | undefined;
        let catchBodyEnd: number | undefined;
        let catchToFinallyJump: number | undefined;
        let catchToEndJump: number | undefined;
        let exceptionBridge: number | undefined;

        if (node.catchClause) {
            catchStart = this.ctx.bytecode.length;
            this.emit(OpCode.CATCH);

            const savedLocals = new Map(this.ctx.locals);
            const savedLocalCount = this.ctx.localCount;
            this.typeInference.enterScope();
            if (node.catchClause.parameter) {
                const localIndex = this.ctx.localCount++;
                this.ctx.locals.set(node.catchClause.parameter, localIndex);
                this.typeInference.registerVariable(node.catchClause.parameter, ASTFactory.typeAnnotation('any'));
                this.emit(OpCode.STORE_LOCAL);
                this.emit(localIndex);
            } else {
                this.emit(OpCode.POP);
            }

            catchBodyStart = this.ctx.bytecode.length;
            this.generateStatement(node.catchClause.body);
            catchBodyEnd = this.ctx.bytecode.length - 1;

            if (node.catchClause.parameter) this.emit(OpCode.POP);
            this.typeInference.exitScope();
            this.ctx.locals = savedLocals;
            this.ctx.localCount = savedLocalCount;

            if (node.finallyBlock) catchToFinallyJump = this.emitJump(OpCode.JMP);
            else catchToEndJump = this.emitJump(OpCode.JMP);
        }

        if (node.finallyBlock) {
            // Exceptions caught from the try body (or from the catch body) execute a
            // duplicated finalizer and then rethrow. The normal path executes it once.
            if (node.catchClause) {
                exceptionBridge = this.ctx.bytecode.length;
                this.emit(OpCode.POP); // discard the exception value placed on the stack by the VM
                this.generateStatement(node.finallyBlock);
                this.emit(OpCode.RETHROW);
            } else {
                exceptionBridge = this.ctx.bytecode.length;
                this.emit(OpCode.POP);
                this.generateStatement(node.finallyBlock);
                this.emit(OpCode.RETHROW);
            }

            const finallyStart = this.ctx.bytecode.length;
            this.generateStatement(node.finallyBlock);
            this.emit(OpCode.FINALLY_END);
            const finallyEnd = this.ctx.bytecode.length - 1;
            this.patchJump(normalJump, finallyStart);
            if (catchToFinallyJump !== undefined) this.patchJump(catchToFinallyJump, finallyStart);

            if (catchStart !== undefined && catchBodyStart !== undefined && catchBodyEnd !== undefined && exceptionBridge !== undefined) {
                // Errors thrown by a catch body must still run finally before escaping.
                this.ctx.exceptionHandlers.push({
                    tryStart: catchBodyStart,
                    tryEnd: catchBodyEnd,
                    catchStart: exceptionBridge,
                    finallyStart,
                    finallyEnd,
                });
                this.ctx.exceptionHandlers.push({
                    tryStart,
                    tryEnd,
                    catchStart,
                    finallyStart,
                    finallyEnd,
                });
            } else if (exceptionBridge !== undefined) {
                this.ctx.exceptionHandlers.push({
                    tryStart,
                    tryEnd,
                    catchStart: exceptionBridge,
                    finallyStart,
                    finallyEnd,
                });
            }
        } else {
            const end = this.ctx.bytecode.length;
            this.patchJump(normalJump, end);
            if (catchToEndJump !== undefined) this.patchJump(catchToEndJump, end);
            if (catchStart !== undefined) {
                this.ctx.exceptionHandlers.push({ tryStart, tryEnd, catchStart });
            }
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

        switch (node.operator.t_type) {
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
                throw new Error(`Unknown binary operator: ${node.operator.t_type}`);
        }
    }

    private generateUnaryExpression(node: UnaryExpression): void {
        this.generateExpression(node.operand);

        switch (node.operator.t_type) {
            case TokenType.MINUS: this.emit(OpCode.NEG); break;
            case TokenType.BANG: this.emit(OpCode.NOT); break;
            default:
                throw new Error(`Unknown unary operator: ${node.operator.t_type}`);
        }
    }

    private generateCallExpression(node: CallExpression): void {
        if (node.callee.type === 'MemberExpression') {
            const member = node.callee as MemberExpression;
            if (member.property.type !== 'IdentifierExpression') {
                throw new Error('Only named methods can be called');
            }
            const methodName = (member.property as IdentifierExpression).name;

            if (member.object.type === 'IdentifierExpression') {
                const objectName = (member.object as IdentifierExpression).name;
                const moduleName = this.moduleNamespaces.get(objectName);
                if (moduleName) {
                    const nativeName = this.standardModules[moduleName]?.[methodName];
                    if (!nativeName) throw new Error(`Module '${moduleName}' does not export '${methodName}'`);
                    this.emitNativeCall(nativeName, node.arguments);
                    return;
                }

                if (this.ctx.classes.has(objectName)) {
                    const fullMethodName = `${objectName}_${methodName}`;
                    const funcDef = this.ctx.functions.get(fullMethodName);
                    if (!funcDef) throw new Error(`Unknown static method: ${objectName}.${methodName}`);
                    for (const arg of node.arguments) this.generateExpression(arg);
                    this.emitFunctionCall(fullMethodName, node.arguments.length);
                    return;
                }
            }

            this.generateExpression(member.object);
            for (const arg of node.arguments) this.generateExpression(arg);
            this.emit(OpCode.METHOD_CALL);
            this.emit(this.addConstant(methodName));
            this.emit(node.arguments.length);
            return;
        }

        if (node.callee.type !== 'IdentifierExpression') {
            throw new Error('Only named functions and methods can be called');
        }

        const funcName = (node.callee as IdentifierExpression).name;
        const nativeName = this.getNativeName(funcName);
        if (nativeName !== undefined) {
            const expectedArgs = this.getExpectedArgCount(funcName);
            if (node.arguments.length !== expectedArgs) {
                throw new Error(`Function '${funcName}' expects ${expectedArgs} arguments, but received ${node.arguments.length}`);
            }
            this.validateArgumentTypes(funcName, node.arguments);
            if (nativeName === 'malloc' || nativeName === 'free') {
                for (const arg of node.arguments) this.generateExpression(arg);
                this.emit(nativeName === 'malloc' ? OpCode.MALLOC : OpCode.FREE);
            } else {
                this.emitNativeCall(nativeName, node.arguments);
            }
            return;
        }

        const funcDef = this.ctx.functions.get(funcName);
        if (!funcDef) throw new Error(`Unknown function: ${funcName}`);
        if (node.arguments.length !== funcDef.parameters.length) {
            throw new Error(`Function '${funcName}' expects ${funcDef.parameters.length} arguments, but received ${node.arguments.length}`);
        }
        for (const arg of node.arguments) this.generateExpression(arg);
        this.emitFunctionCall(funcName, node.arguments.length);
    }

    private emitFunctionCall(functionName: string, argCount: number): void {
        if (!this.ctx.functions.has(functionName)) throw new Error(`Unknown function: ${functionName}`);
        this.emit(OpCode.CALL);
        const operandIndex = this.ctx.bytecode.length;
        this.emit(0);
        this.emit(0);
        this.emit(argCount);
        this.functionCallPatches.push({ operandIndex, functionName });
    }

    private patchFunctionCalls(): void {
        for (const patch of this.functionCallPatches) {
            const address = this.ctx.functions.get(patch.functionName)?.address;
            if (address === undefined) throw new Error(`Unresolved function address for '${patch.functionName}'.`);
            if (address > 0xFFFF) throw new Error(`Function '${patch.functionName}' exceeds the VM's 16-bit address limit.`);
            this.ctx.bytecode[patch.operandIndex] = (address >> 8) & 0xFF;
            this.ctx.bytecode[patch.operandIndex + 1] = address & 0xFF;
        }
    }

    private emitNativeCall(nativeName: string, args: Expression[]): void {
        const expectedArgs = this.builtInArgCounts.get(nativeName);
        if (expectedArgs === undefined) throw new Error(`Unknown native function '${nativeName}'`);
        if (args.length !== expectedArgs) {
            throw new Error(`Native function '${nativeName}' expects ${expectedArgs} arguments, but received ${args.length}`);
        }
        for (const arg of args) this.generateExpression(arg);
        this.emit(OpCode.CALL_NATIVE);
        this.emit(this.addConstant(nativeName));
        this.emit(args.length);
    }

    private generateMemberExpression(node: MemberExpression): void {
        this.generateExpression(node.object);

        if (node.computed) {
            this.generateExpression(node.property);
            this.emit(OpCode.ARRAY_GET);
        } else {
            const fieldName = (node.property as IdentifierExpression).name;
            this.emit(OpCode.PUSH_CONST);
            this.emit(this.addConstant(fieldName));
            this.emit(OpCode.FIELD_GET);
        }
    }

    private generateAssignmentExpression(node: AssignmentExpression): void {
        if (node.target.type === 'IdentifierExpression') {
            const name = (node.target as IdentifierExpression).name;
            const localIndex = this.ctx.locals.get(name);
            const globalIndex = this.ctx.globals.get(name);
            if (localIndex === undefined && globalIndex === undefined) {
                throw new Error(`Undefined variable: ${name}`);
            }

            if (node.operator.t_type !== TokenType.EQUAL) {
                if (localIndex !== undefined) {
                    this.emit(OpCode.LOAD_LOCAL);
                    this.emit(localIndex);
                } else {
                    this.emit(OpCode.LOAD_GLOBAL);
                    this.emit(globalIndex!);
                }
            }
            this.generateExpression(node.value);

            if (node.operator.t_type !== TokenType.EQUAL) {
                const arithmetic: Partial<Record<TokenType, OpCode>> = {
                    [TokenType.PLUS_EQUAL]: OpCode.ADD,
                    [TokenType.MINUS_EQUAL]: OpCode.SUB,
                    [TokenType.STAR_EQUAL]: OpCode.MUL,
                    [TokenType.SLASH_EQUAL]: OpCode.DIV,
                };
                const opcode = arithmetic[node.operator.t_type];
                if (opcode === undefined) throw new Error(`Unsupported assignment operator ${node.operator.t_type}`);
                this.emit(opcode);
            }

            if (localIndex !== undefined) {
                this.emit(OpCode.STORE_LOCAL);
                this.emit(localIndex);
            } else {
                this.emit(OpCode.STORE_GLOBAL);
                this.emit(globalIndex!);
            }
            return;
        }

        if (node.target.type === 'MemberExpression') {
            const member = node.target as MemberExpression;
            const compoundOpcode: Partial<Record<TokenType, OpCode>> = {
                [TokenType.PLUS_EQUAL]: OpCode.ADD,
                [TokenType.MINUS_EQUAL]: OpCode.SUB,
                [TokenType.STAR_EQUAL]: OpCode.MUL,
                [TokenType.SLASH_EQUAL]: OpCode.DIV,
            };
            const compound = node.operator.t_type !== TokenType.EQUAL;
            const arithmeticOpcode = compound ? compoundOpcode[node.operator.t_type] : undefined;
            if (compound && arithmeticOpcode === undefined) {
                throw new Error(`Unsupported compound assignment operator ${node.operator.t_type}`);
            }

            this.generateExpression(member.object);
            if (compound) this.emit(OpCode.DUP);

            if (member.computed) {
                this.generateExpression(member.property);
                if (compound) {
                    this.emit(OpCode.ARRAY_GET);
                    this.generateExpression(node.value);
                    this.emit(arithmeticOpcode!);
                    this.generateExpression(member.property);
                    this.emit(OpCode.SWAP);
                } else {
                    this.generateExpression(node.value);
                }
                this.emit(OpCode.ARRAY_SET);
            } else {
                const fieldName = (member.property as IdentifierExpression).name;
                if (compound) {
                    this.emit(OpCode.PUSH_CONST);
                    this.emit(this.addConstant(fieldName));
                    this.emit(OpCode.FIELD_GET);
                    this.generateExpression(node.value);
                    this.emit(arithmeticOpcode!);
                    this.emit(OpCode.PUSH_CONST);
                    this.emit(this.addConstant(fieldName));
                    this.emit(OpCode.SWAP);
                } else {
                    this.emit(OpCode.PUSH_CONST);
                    this.emit(this.addConstant(fieldName));
                    this.generateExpression(node.value);
                }
                this.emit(OpCode.FIELD_SET);
            }
            return;
        }

        throw new Error('Invalid assignment target');
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


    private getNativeName(funcName: string): string | undefined {
        const aliased = this.builtinAliases.get(funcName);
        if (aliased) return aliased;
        return this.builtInArgCounts.has(funcName) ? funcName : undefined;
    }

    private isBuiltIn(funcName: string): boolean {
        return this.getNativeName(funcName) !== undefined;
    }

    private getExpectedArgCount(funcName: string): number {
        const nativeName = this.getNativeName(funcName);
        return nativeName === undefined ? -1 : (this.builtInArgCounts.get(nativeName) ?? -1);
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
        const addressIndex = this.ctx.bytecode.length;
        this.emit(0xFF);
        this.emit(0xFF);
        return addressIndex;
    }

    private patchJump(address: number, target = this.ctx.bytecode.length): void {
        const jumpTarget = target;

        const highByte = (jumpTarget >> 8) & 0xFF;
        const lowByte = jumpTarget & 0xFF;

        this.ctx.bytecode[address] = highByte;
        this.ctx.bytecode[address + 1] = lowByte;
    }

    private emitLoop(loopStart: number): void {
        this.emit(OpCode.JMP);
        const highByte = (loopStart >> 8) & 0xFF;
        const lowByte = loopStart & 0xFF;
        this.emit(highByte);
        this.emit(lowByte);
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