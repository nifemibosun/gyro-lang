import { TokenType } from './lexer.js';
import {
    Expression, Statement, TypeAnnotation, ASTFactory,
    LiteralExpression, BinaryExpression, UnaryExpression,
    CallExpression, IdentifierExpression, ArrayExpression,
    ObjectLiteralExpression, AssignmentExpression,
    FunctionDeclaration, ReturnStatement, BlockStatement
} from './ast.js';

export class TypeInferenceEngine {
    private variableTypes: Map<string, TypeAnnotation> = new Map();
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
                const varType = this.variableTypes.get(identifier.name);
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

            case 'MemberExpression':
                return ASTFactory.typeAnnotation('any');

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

        switch (expr.operator.type) {
            case TokenType.PLUS:
                if (leftType.name === 'string' || rightType.name === 'string') {
                    return ASTFactory.typeAnnotation('string');
                }
                return this.inferNumericResultType(leftType, rightType);

            case TokenType.MINUS:
            case TokenType.STAR:
            case TokenType.SLASH:
            case TokenType.PERCENT:
                return this.inferNumericResultType(leftType, rightType);

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

        switch (expr.operator.type) {
            case TokenType.MINUS:
            case TokenType.PLUS_PLUS:
            case TokenType.MINUS_MINUS:
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
        if (expr.callee.type === 'IdentifierExpression') {
            const funcName = (expr.callee as IdentifierExpression).name;
            
            switch (funcName) {
                case 'print':
                    return ASTFactory.typeAnnotation('void');
                case 'input':
                    return ASTFactory.typeAnnotation('string');
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
            if (returnType.name !== declaredType && returnType.name !== 'void') {
                console.warn(`Warning: Return type '${returnType.name}' doesn't match declared type '${declaredType}' in function '${func.name}'`);
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
        }

        return returnTypes;
    }

    registerVariable(name: string, type: TypeAnnotation): void {
        this.variableTypes.set(name, type);
    }

    registerFunction(name: string, type: TypeAnnotation): void {
        this.functionTypes.set(name, type);
    }

    getVariableType(name: string): TypeAnnotation | undefined {
        return this.variableTypes.get(name);
    }

    clearContext(): void {
        this.variableTypes.clear();
        this.functionTypes.clear();
    }
}