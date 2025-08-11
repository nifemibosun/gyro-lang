import { Token, TokenType, GyroLexer } from './lexer.js';
import { 
    Program, Statement, Expression, VariableDeclaration,
    FunctionDeclaration, ClassDeclaration, BlockStatement,
    IfStatement, WhileStatement, ReturnStatement, CallExpression,
    ArrayExpression, ObjectLiteralExpression, TypeAnnotation,
    Parameter, FieldDeclaration, ObjectField, TryStatement,
    CatchClause, ThrowStatement, ExpressionStatement, ForStatement,
    BreakStatement, ContinueStatement, ASTFactory,
    AssignmentExpression
} from './ast.js';

export class GyroParser {
    private tokens: Token[];
    private current = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    parse(): Program {
        const statements: Statement[] = [];
        const imports: any[] = [];
        const exports: any[] = [];

        while (!this.isAtEnd()) {
            try {
                const stmt = this.declaration();
                if (stmt) statements.push(stmt);
            } catch (error) {
                this.synchronize();
                throw error;
            }
        }

        return ASTFactory.program(statements, imports, exports);
    }

    // Declarations
    private declaration(): Statement | null {
        try {
            if (this.match(TokenType.CLASS)) return this.classDeclaration();
            if (this.match(TokenType.FUN)) return this.functionDeclaration();
            if (this.match(TokenType.LET, TokenType.CONST)) return this.variableDeclaration();
            if (this.match(TokenType.TRY)) return this.tryStatement();
            
            return this.statement();
        } catch (error) {
            this.synchronize();
            throw error;
        }
    }

    private classDeclaration(): ClassDeclaration {
        const name = this.consume(TokenType.IDENTIFIER, "Expected class name").value;
        
        let superClass: string | undefined;
        if (this.match(TokenType.EXTENDS)) {
            superClass = this.consume(TokenType.IDENTIFIER, "Expected superclass name").value;
        }

        this.consume(TokenType.LEFT_BRACE, "Expected '{' before class body");

        const fields: FieldDeclaration[] = [];
        const methods: FunctionDeclaration[] = [];

        while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
            if (this.check(TokenType.FUN)) {
                this.advance(); // consume 'fun'
                methods.push(this.functionDeclaration());
            } else {
                // Field declaration: name: type;
                const fieldName = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
                this.consume(TokenType.COLON, "Expected ':' after field name");
                const typeAnnotation = this.typeAnnotation();
                
                let defaultValue: Expression | undefined;
                if (this.match(TokenType.EQUAL)) {
                    defaultValue = this.expression();
                }
                
                this.consume(TokenType.SEMICOLON, "Expected ';' after field declaration");
                
                fields.push(ASTFactory.fieldDecl(fieldName, typeAnnotation, 'public', defaultValue));
            }
        }

        this.consume(TokenType.RIGHT_BRACE, "Expected '}' after class body");
        return ASTFactory.classDecl(name, fields, methods, superClass);
    }

    private functionDeclaration(): FunctionDeclaration {
        const name = this.consume(TokenType.IDENTIFIER, "Expected function name").value;

        this.consume(TokenType.LEFT_PAREN, "Expected '(' after function name");
        
        const parameters: Parameter[] = [];
        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                const paramName = this.consume(TokenType.IDENTIFIER, "Expected parameter name").value;
                this.consume(TokenType.COLON, "Expected ':' after parameter name");
                const paramType = this.typeAnnotation();
                
                let defaultValue: Expression | undefined;
                if (this.match(TokenType.EQUAL)) {
                    defaultValue = this.expression();
                }
                
                parameters.push(ASTFactory.parameter(paramName, paramType, defaultValue));
            } while (this.match(TokenType.COMMA));
        }
        
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after parameters");

        // Return type is REQUIRED for functions
        this.consume(TokenType.COLON, "Expected ':' and return type after function parameters");
        const returnType = this.typeAnnotation();

        this.consume(TokenType.LEFT_BRACE, "Expected '{' before function body");
        const body = this.blockStatement();

        return ASTFactory.functionDecl(name, parameters, returnType, body);
    }

    private variableDeclaration(): VariableDeclaration {
        const isConstant = this.previous().type === TokenType.CONST;
        const name = this.consume(TokenType.IDENTIFIER, "Expected variable name").value;

        let typeAnnotation: TypeAnnotation | undefined;
        
        // Type annotation is now optional
        if (this.match(TokenType.COLON)) {
            typeAnnotation = this.typeAnnotation();
        }

        let initializer: Expression | undefined;
        if (this.match(TokenType.EQUAL)) {
            initializer = this.expression();
        } else if (isConstant) {
            throw this.error(this.peek(), "Constant variables must be initialized");
        } else if (!typeAnnotation) {
            throw this.error(this.peek(), "Variable must have type annotation or initializer for type inference");
        }

        this.consume(TokenType.SEMICOLON, "Expected ';' after variable declaration");
        return ASTFactory.variableDecl(name, typeAnnotation, initializer, isConstant);
    }

    private typeAnnotation(): TypeAnnotation {
        if (this.match(TokenType.INT, TokenType.STRING_TYPE, TokenType.BOOL, TokenType.VOID)) {
            const typeName = this.previous().value;
            return ASTFactory.typeAnnotation(typeName);
        }
        
        if (this.match(TokenType.IDENTIFIER)) {
        const typeName = this.previous().value;
        return ASTFactory.typeAnnotation(typeName);
    }
        let nullable = false;
        if (this.match(TokenType.QUESTION)) {
            nullable = true;
        }

        throw this.error(this.peek(), "Expected type name");
    }

    // Statements
    private statement(): Statement {
        if (this.match(TokenType.IF)) return this.ifStatement();
        if (this.match(TokenType.WHILE)) return this.whileStatement();
        if (this.match(TokenType.FOR)) return this.forStatement();
        if (this.match(TokenType.RETURN)) return this.returnStatement();
        if (this.match(TokenType.BREAK)) return this.breakStatement();
        if (this.match(TokenType.CONTINUE)) return this.continueStatement();
        if (this.match(TokenType.THROW)) return this.throwStatement();
        if (this.match(TokenType.LEFT_BRACE)) return this.blockStatement();

        return this.expressionStatement();
    }

    private blockStatement(): BlockStatement {
        const statements: Statement[] = [];

        while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
            const stmt = this.declaration();
            if (stmt) statements.push(stmt);
        }

        this.consume(TokenType.RIGHT_BRACE, "Expected '}' after block");
        return ASTFactory.block(statements);
    }

    private ifStatement(): IfStatement {
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after 'if'");
        const condition = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after if condition");

        const thenBranch = this.statement();
        let elseBranch: Statement | undefined;
        if (this.match(TokenType.ELSE)) {
            elseBranch = this.statement();
        }

        return ASTFactory.ifStmt(condition, thenBranch, elseBranch);
    }

    private whileStatement(): WhileStatement {
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after 'while'");
        const condition = this.expression();
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after while condition");
        const body = this.statement();

        return ASTFactory.whileStmt(condition, body);
    }

    private forStatement(): ForStatement {
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after 'for'");

        let initializer: VariableDeclaration | ExpressionStatement | undefined;
        if (this.match(TokenType.SEMICOLON)) {
            initializer = undefined;
        } else if (this.match(TokenType.LET, TokenType.CONST)) {
            initializer = this.variableDeclaration();
        } else {
            initializer = this.expressionStatement();
        }

        let condition: Expression | undefined;
        if (!this.check(TokenType.SEMICOLON)) {
            condition = this.expression();
        }
        this.consume(TokenType.SEMICOLON, "Expected ';' after for loop condition");

        let increment: Expression | undefined;
        if (!this.check(TokenType.RIGHT_PAREN)) {
            increment = this.expression();
        }
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after for clauses");

        const body = this.statement();

        return { type: 'ForStatement', initializer, condition, increment, body };
    }

    private returnStatement(): ReturnStatement {
        let value: Expression | undefined;
        if (!this.check(TokenType.SEMICOLON)) {
            value = this.expression();
        }
        this.consume(TokenType.SEMICOLON, "Expected ';' after return value");
        return ASTFactory.returnStmt(value);
    }

    private breakStatement(): BreakStatement {
        this.consume(TokenType.SEMICOLON, "Expected ';' after 'break'");
        return { type: 'BreakStatement' };
    }

    private continueStatement(): ContinueStatement {
        this.consume(TokenType.SEMICOLON, "Expected ';' after 'continue'");
        return { type: 'ContinueStatement' };
    }

    private throwStatement(): ThrowStatement {
        const argument = this.expression();
        this.consume(TokenType.SEMICOLON, "Expected ';' after throw expression");
        return { type: 'ThrowStatement', argument };
    }

    private tryStatement(): TryStatement {
        const body = this.blockStatement();

        let catchClause: CatchClause | undefined;
        if (this.match(TokenType.CATCH)) {
            let parameter: string | undefined;
            if (this.match(TokenType.LEFT_PAREN)) {
                parameter = this.consume(TokenType.IDENTIFIER, "Expected catch parameter name").value;
                this.consume(TokenType.RIGHT_PAREN, "Expected ')' after catch parameter");
            }
            const catchBody = this.blockStatement();
            catchClause = { type: 'CatchClause', parameter, body: catchBody };
        }

        let finallyBlock: BlockStatement | undefined;
        if (this.match(TokenType.FINALLY)) {
            finallyBlock = this.blockStatement();
        }

        if (!catchClause && !finallyBlock) {
            throw this.error(this.previous(), "Try statement must have either catch or finally clause");
        }

        return { type: 'TryStatement', body, catchClause, finallyBlock };
    }

    private expressionStatement(): ExpressionStatement {
        const expr = this.expression();
        this.consume(TokenType.SEMICOLON, "Expected ';' after expression");
        return { type: 'ExpressionStatement', expression: expr };
    }

    private expression(): Expression {
        return this.assignment();
    }

    private assignment(): Expression | AssignmentExpression {
        const expr = this.logicalOr();

        if (this.match(TokenType.EQUAL, TokenType.PLUS_EQUAL, TokenType.MINUS_EQUAL, TokenType.STAR_EQUAL, TokenType.SLASH_EQUAL)) {
            const operator = this.previous();
            const value = this.assignment();
            return { type: 'AssignmentExpression', target: expr, value, operator };
        }

        return expr;
    }

    private logicalOr(): Expression {
        let expr = this.logicalAnd();

        while (this.match(TokenType.OR_OR)) {
            const operator = this.previous();
            const right = this.logicalAnd();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private logicalAnd(): Expression {
        let expr = this.equality();

        while (this.match(TokenType.AND_AND)) {
            const operator = this.previous();
            const right = this.equality();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private equality(): Expression {
        let expr = this.comparison();

        while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
            const operator = this.previous();
            const right = this.comparison();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private comparison(): Expression {
        let expr = this.term();

        while (this.match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)) {
            const operator = this.previous();
            const right = this.term();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private term(): Expression {
        let expr = this.factor();

        while (this.match(TokenType.MINUS, TokenType.PLUS)) {
            const operator = this.previous();
            const right = this.factor();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private factor(): Expression {
        let expr = this.unary();

        while (this.match(TokenType.SLASH, TokenType.STAR, TokenType.PERCENT)) {
            const operator = this.previous();
            const right = this.unary();
            expr = ASTFactory.binary(expr, operator, right);
        }

        return expr;
    }

    private unary(): Expression {
        if (this.match(TokenType.BANG, TokenType.MINUS, TokenType.PLUS_PLUS, TokenType.MINUS_MINUS)) {
            const operator = this.previous();
            const right = this.unary();
            return ASTFactory.unary(operator, right);
        }

        return this.call();
    }

    private call(): Expression {
        let expr = this.primary();

        while (true) {
            if (this.match(TokenType.LEFT_PAREN)) {
                expr = this.finishCall(expr);
            } else if (this.match(TokenType.DOT)) {
                const name = this.consume(TokenType.IDENTIFIER, "Expected property name after '.'");
                expr = ASTFactory.member(expr, ASTFactory.identifier(name.value), false);
            } else if (this.match(TokenType.LEFT_BRACKET)) {
                const index = this.expression();
                this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after array index");
                expr = ASTFactory.member(expr, index, true);
            } else {
                break;
            }
        }

        return expr;
    }

    private finishCall(callee: Expression): CallExpression {
        const args: Expression[] = [];

        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                args.push(this.expression());
            } while (this.match(TokenType.COMMA));
        }

        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after arguments");
        return ASTFactory.call(callee, args);
    }

    private primary(): Expression {
        if (this.match(TokenType.TRUE)) {
            return ASTFactory.literal(true, 'boolean');
        }

        if (this.match(TokenType.FALSE)) {
            return ASTFactory.literal(false, 'boolean');
        }

        if (this.match(TokenType.NULL)) {
            return ASTFactory.literal(null, 'null');
        }

        if (this.match(TokenType.NUMBER)) {
            return ASTFactory.literal(this.previous().value, 'number');
        }

        if (this.match(TokenType.STRING)) {
            return ASTFactory.literal(this.previous().value, 'string');
        }

        if (this.match(TokenType.IDENTIFIER)) {
            const name = this.previous().value;
            
            // Check for object literal: Person { ... }
            if (this.check(TokenType.LEFT_BRACE)) {
                return this.objectLiteral(name);
            }
            
            return ASTFactory.identifier(name);
        }

        if (this.match(TokenType.SELF)) {
            return ASTFactory.identifier('self');
        }

        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.expression();
            this.consume(TokenType.RIGHT_PAREN, "Expected ')' after expression");
            return expr;
        }

        if (this.match(TokenType.LEFT_BRACKET)) {
            return this.arrayLiteral();
        }

        throw this.error(this.peek(), "Expected expression");
    }

    private objectLiteral(className: string): ObjectLiteralExpression {
        this.consume(TokenType.LEFT_BRACE, "Expected '{' for object literal");
        
        const fields: ObjectField[] = [];
        
        if (!this.check(TokenType.RIGHT_BRACE)) {
            do {
                const key = this.consume(TokenType.IDENTIFIER, "Expected field name").value;
                this.consume(TokenType.COLON, "Expected ':' after field name");
                const value = this.expression();
                
                fields.push(ASTFactory.objectField(key, value));
            } while (this.match(TokenType.COMMA));
        }

        this.consume(TokenType.RIGHT_BRACE, "Expected '}' after object literal");
        return ASTFactory.objectLiteral(className, fields);
    }

    private arrayLiteral(): ArrayExpression {
        const elements: Expression[] = [];

        if (!this.check(TokenType.RIGHT_BRACKET)) {
            do {
                elements.push(this.expression());
            } while (this.match(TokenType.COMMA));
        }

        this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after array elements");
        return { type: 'ArrayExpression', elements };
    }

    // Utility methods
    private match(...types: TokenType[]): boolean {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    private check(type: TokenType): boolean {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    private advance(): Token {
        if (!this.isAtEnd()) this.current++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private peek(): Token {
        return this.tokens[this.current];
    }

    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    private consume(type: TokenType, message: string): Token {
        if (this.check(type)) return this.advance();
        throw this.error(this.peek(), message);
    }

    private error(token: Token, message: string): Error {
        const location = `${token.line}:${token.column}`;
        return new Error(`Parse Error at ${location}: ${message}`);
    }

    private synchronize(): void {
        this.advance();

        while (!this.isAtEnd()) {
            if (this.previous().type === TokenType.SEMICOLON) return;

            switch (this.peek().type) {
                case TokenType.CLASS:
                case TokenType.FUN:
                case TokenType.LET:
                case TokenType.CONST:
                case TokenType.FOR:
                case TokenType.IF:
                case TokenType.WHILE:
                case TokenType.RETURN:
                case TokenType.TRY:
                    return;
            }

            this.advance();
        }
    }
}

// Utility functions for easy parsing
export function parse(tokens: Token[]): Program {
    const parser = new GyroParser(tokens);
    return parser.parse();
}

export function parseSource(source: string): Program {
    const lexer = new GyroLexer(source);
    const tokens = lexer.tokenize();
    const parser = new GyroParser(tokens);
    return parser.parse();
}