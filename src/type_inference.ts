import { TokenType } from './lexer.js';
import { ASTFactory } from './ast.js';
import type {
    Expression, Statement, TypeAnnotation,
    LiteralExpression, BinaryExpression, UnaryExpression,
    CallExpression, IdentifierExpression, ArrayExpression,
    ObjectLiteralExpression, AssignmentExpression,
    FunctionDeclaration, ReturnStatement, BlockStatement, IfStatement,
    WhileStatement, ForStatement, TryStatement, MemberExpression
} from './ast.js';

export class TypeInferenceEngine {
    private variableScopes: Map<string, TypeAnnotation>[] = [new Map()];
    private functionTypes: Map<string, TypeAnnotation> = new Map();

    inferLiteralType(expr: LiteralExpression): TypeAnnotation {
        switch (expr.dataType) {
            case 'number':
                return ASTFactory.typeAnnotation(
                    Number.isInteger(expr.value) ? 'int' : 'float'
                );
            case 'string':
                return ASTFactory.typeAnnotation('string');
            case 'boolean':
                return ASTFactory.typeAnnotation('bool');
            case 'null':
                return ASTFactory.typeAnnotation('null');
            default:
                return ASTFactory.typeAnnotation('any');
        }
    }

    inferExpressionType(expr: Expression): TypeAnnotation {
        switch (expr.type) {
            case 'LiteralExpression':
                return this.inferLiteralType(expr as LiteralExpression);

            case 'IdentifierExpression':
                const identifier = expr as IdentifierExpression;
                const varType = this.getVariableType(identifier.name);
                if (varType) {
                    return varType;
                }
                return ASTFactory.typeAnnotation('any');

            case 'BinaryExpression':
                return this.inferBinaryExpressionType(expr as BinaryExpression);

            case 'UnaryExpression':
                return this.inferUnaryExpressionType(expr as UnaryExpression);

            case 'ArrayExpression':
                return this.inferArrayType(expr as ArrayExpression);

            case 'ObjectLiteralExpression':
                const objLiteral = expr as ObjectLiteralExpression;
                return ASTFactory.typeAnnotation(objLiteral.className);

            case 'CallExpression':
                return this.inferCallExpressionType(expr as CallExpression);

            case 'MemberExpression': {
                const member = expr as MemberExpression;
                const propertyName = member.property.type === 'IdentifierExpression'
                    ? (member.property as IdentifierExpression).name
                    : undefined;
                if (propertyName) {
                    const objectType = this.inferExpressionType(member.object).name;
                    return this.functionTypes.get(`${objectType}_${propertyName}`)
                        ?? this.functionTypes.get(`${objectType}.${propertyName}`)
                        ?? ASTFactory.typeAnnotation('any');
                }
                return ASTFactory.typeAnnotation('any');
            }

            case 'AssignmentExpression':
                const assignment = expr as AssignmentExpression;
                return this.inferExpressionType(assignment.value);

            default:
                return ASTFactory.typeAnnotation('any');
        }
    }

    private inferBinaryExpressionType(expr: BinaryExpression): TypeAnnotation {
        const leftType = this.inferExpressionType(expr.left);
        const rightType = this.inferExpressionType(expr.right);

        switch (expr.operator.t_type) {
            case TokenType.PLUS:
                if (leftType.name === 'string' || rightType.name === 'string') {
                    return ASTFactory.typeAnnotation('string');
                }
                return this.inferNumericResultType(leftType, rightType);

            case TokenType.MINUS:
            case TokenType.STAR:
            case TokenType.PERCENT:
                return this.inferNumericResultType(leftType, rightType);

            case TokenType.SLASH:
                return ASTFactory.typeAnnotation('float');

            case TokenType.EQUAL_EQUAL:
            case TokenType.BANG_EQUAL:
            case TokenType.GREATER:
            case TokenType.GREATER_EQUAL:
            case TokenType.LESS:
            case TokenType.LESS_EQUAL:
                return ASTFactory.typeAnnotation('bool');

            case TokenType.AND_AND:
            case TokenType.OR_OR:
                return ASTFactory.typeAnnotation('bool');

            default:
                return ASTFactory.typeAnnotation('any');
        }
    }

    private inferUnaryExpressionType(expr: UnaryExpression): TypeAnnotation {
        const operandType = this.inferExpressionType(expr.operand);

        switch (expr.operator.t_type) {
            case TokenType.MINUS:
                return operandType;

            case TokenType.BANG:
                return ASTFactory.typeAnnotation('bool');

            default:
                return operandType;
        }
    }

    private inferNumericResultType(leftType: TypeAnnotation, rightType: TypeAnnotation): TypeAnnotation {
        if (leftType.name === 'float' || rightType.name === 'float') {
            return ASTFactory.typeAnnotation('float');
        }
        if (leftType.name === 'int' && rightType.name === 'int') {
            return ASTFactory.typeAnnotation('int');
        }
        if (leftType.name === 'uint' || rightType.name === 'uint') {
            return ASTFactory.typeAnnotation('uint');
        }
        return ASTFactory.typeAnnotation('int');
    }

    private inferArrayType(expr: ArrayExpression): TypeAnnotation {
        if (expr.elements.length === 0) {
            return ASTFactory.typeAnnotation('array', [ASTFactory.typeAnnotation('any')]);
        }

        const firstElementType = this.inferExpressionType(expr.elements[0]);
        
        const allSameType = expr.elements.every(element => {
            const elementType = this.inferExpressionType(element);
            return elementType.name === firstElementType.name;
        });

        if (allSameType) {
            return ASTFactory.typeAnnotation('array', [firstElementType]);
        } else {
            return ASTFactory.typeAnnotation('array', [ASTFactory.typeAnnotation('any')]);
        }
    }

    private inferCallExpressionType(expr: CallExpression): TypeAnnotation {
        if (expr.callee.type === 'MemberExpression') {
            const member = expr.callee as MemberExpression;
            if (member.property.type === 'IdentifierExpression') {
                const propertyName = (member.property as IdentifierExpression).name;
                const inferredObjectName = this.inferExpressionType(member.object).name;
                const objectName = inferredObjectName !== 'any'
                    ? inferredObjectName
                    : member.object.type === 'IdentifierExpression'
                        ? (member.object as IdentifierExpression).name
                        : inferredObjectName;
                return this.functionTypes.get(`${objectName}.${propertyName}`)
                    ?? this.functionTypes.get(`${objectName}_${propertyName}`)
                    ?? ASTFactory.typeAnnotation('any');
            }
            return ASTFactory.typeAnnotation('any');
        }

        if (expr.callee.type === 'IdentifierExpression') {
            const funcName = (expr.callee as IdentifierExpression).name;
            const registeredType = this.functionTypes.get(funcName);
            if (registeredType) return registeredType;
            
            switch (funcName) {
                case 'print':
                case 'println':
                case 'assert':
                    return ASTFactory.typeAnnotation('void');
                case 'input':
                    return ASTFactory.typeAnnotation('string');
                case 'len':
                case 'int':
                case 'stringLength':
                case 'stringIndexOf':
                case 'stringToInt':
                case 'arrayLength':
                case 'arrayPush':
                    return ASTFactory.typeAnnotation('int');
                case 'float':
                case 'abs':
                case 'floor':
                case 'ceil':
                case 'round':
                case 'sqrt':
                case 'pow':
                case 'min':
                case 'max':
                case 'sin':
                case 'cos':
                case 'tan':
                case 'log':
                case 'exp':
                case 'random':
                    return ASTFactory.typeAnnotation('float');
                case 'str':
                case 'typeOf':
                case 'stringCharAt':
                case 'stringSubstring':
                case 'stringReplace':
                case 'stringToFloat':
                case 'arrayJoin':
                    return ASTFactory.typeAnnotation('string');
                case 'stringSplit':
                    return ASTFactory.typeAnnotation('array', [ASTFactory.typeAnnotation('string')]);
                case 'stringContains':
                case 'stringStartsWith':
                case 'stringEndsWith':
                case 'arrayIncludes':
                    return ASTFactory.typeAnnotation('bool');
                case 'arrayPop':
                case 'malloc':
                    return ASTFactory.typeAnnotation('any');
                default:
                    const funcType = this.functionTypes.get(funcName);
                    return funcType || ASTFactory.typeAnnotation('any');
            }
        }
        
        return ASTFactory.typeAnnotation('any');
    }

    validateFunctionReturnType(func: FunctionDeclaration): void {
        if (!func.returnType) {
            throw new Error(`Function '${func.name}' must have explicit return type`);
        }
        
        const returnTypes = this.findReturnTypes(func.body);
        const declaredType = func.returnType.name;
        
        for (const returnType of returnTypes) {
            if (returnType.name !== declaredType && returnType.name !== 'void' && returnType.name !== 'any') {
                throw new Error(`Return type '${returnType.name}' doesn't match declared type '${declaredType}' in function '${func.name}'.`);
            }
        }
    }

    private findReturnTypes(stmt: Statement): TypeAnnotation[] {
        const returnTypes: TypeAnnotation[] = [];

        if (stmt.type === 'ReturnStatement') {
            const returnStmt = stmt as ReturnStatement;
            if (returnStmt.value) {
                returnTypes.push(this.inferExpressionType(returnStmt.value));
            } else {
                returnTypes.push(ASTFactory.typeAnnotation('void'));
            }
        } else if (stmt.type === 'BlockStatement') {
            const block = stmt as BlockStatement;
            for (const childStmt of block.statements) {
                returnTypes.push(...this.findReturnTypes(childStmt));
            }
        } else if (stmt.type === 'IfStatement') {
            const branch = stmt as IfStatement;
            returnTypes.push(...this.findReturnTypes(branch.thenBranch));
            if (branch.elseBranch) returnTypes.push(...this.findReturnTypes(branch.elseBranch));
        } else if (stmt.type === 'WhileStatement') {
            returnTypes.push(...this.findReturnTypes((stmt as WhileStatement).body));
        } else if (stmt.type === 'ForStatement') {
            returnTypes.push(...this.findReturnTypes((stmt as ForStatement).body));
        } else if (stmt.type === 'TryStatement') {
            const tryStmt = stmt as TryStatement;
            returnTypes.push(...this.findReturnTypes(tryStmt.body));
            if (tryStmt.catchClause) returnTypes.push(...this.findReturnTypes(tryStmt.catchClause.body));
            if (tryStmt.finallyBlock) returnTypes.push(...this.findReturnTypes(tryStmt.finallyBlock));
        }

        return returnTypes;
    }

    enterScope(): void {
        this.variableScopes.push(new Map());
    }

    exitScope(): void {
        if (this.variableScopes.length <= 1) {
            throw new Error('Cannot exit the global type-inference scope.');
        }
        this.variableScopes.pop();
    }

    registerVariable(name: string, type: TypeAnnotation): void {
        this.variableScopes[this.variableScopes.length - 1]!.set(name, type);
    }

    registerFunction(name: string, type: TypeAnnotation): void {
        this.functionTypes.set(name, type);
    }

    getVariableType(name: string): TypeAnnotation | undefined {
        for (let i = this.variableScopes.length - 1; i >= 0; i--) {
            const type = this.variableScopes[i]!.get(name);
            if (type) return type;
        }
        return undefined;
    }

    clearContext(): void {
        this.variableScopes = [new Map()];
        this.functionTypes.clear();
    }
}