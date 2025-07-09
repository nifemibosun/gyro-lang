import { Token, TokenType } from './lexer.js';
import {
    ProgramNode, StatementNode, ExpressionNode, FunctionDeclarationNode,
    VariableDeclarationNode, ReturnStatementNode, IfStatementNode, WhileStatementNode,
    BlockStatementNode, ExpressionStatementNode, BinaryExpressionNode, UnaryExpressionNode,
    CallExpressionNode, IdentifierNode, LiteralNode, NodeType, AssignmentExpressionNode,
    MemberExpressionNode, TernaryExpressionNode, ArrayLiteralNode, ObjectLiteralNode,
    PropertyNode, FunctionExpressionNode // FunctionExpressionNode is currently unused but kept for future use
} from './ast.js';

class ParserError extends Error {
    constructor(message: string, token: Token) {
        super(`Parsing Error: ${message} at ${token.line}:${token.column} (Token: ${TokenType[token.type]} '${token.value || ''}')`);
        this.name = 'ParserError';
    }
}

export class Parser {
    private tokens: Token[];
    private currentTokenIndex: number = 0;

    constructor(tokens: Token[]) {
        this.tokens = tokens;
    }

    public parse(): ProgramNode {
        const body: StatementNode[] = [];
        while (!this.isAtEnd()) {
            body.push(this.parseStatement());
        }
        return { type: NodeType.Program, body, loc: this.currentLoc() };
    }

    // --- Utility Methods ---
    private parseExpression(): ExpressionNode {
        return this.parseTernary();
    }

    private peek(): Token {
        return this.tokens[this.currentTokenIndex];
    }

    private previous(): Token {
        return this.tokens[this.currentTokenIndex - 1];
    }

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
        if (!this.isAtEnd()) this.currentTokenIndex++;
        return this.previous();
    }

    private isAtEnd(): boolean {
        return this.peek().type === TokenType.EOF;
    }

    private consume(expectedType: TokenType, errorMessage: string): Token {
        if (this.check(expectedType)) {
            return this.advance();
        }
        throw new ParserError(errorMessage, this.peek());
    }

    private currentLoc() {
        return { line: this.peek().line, column: this.peek().column };
    }

    // --- Primary Parsing Rules ---
    private parseIdentifier(): IdentifierNode {
        const token = this.consume(TokenType.IDENTIFIER, "Expected an identifier.");
        return { type: NodeType.Identifier, value: token.value as string, loc: this.currentLoc() };
    }

    private parseLiteral(): LiteralNode {
        const token = this.advance(); // Advance here as match() already confirmed the type
        let value: any;
        switch (token.type) {
            case TokenType.NUMBER:
                value = parseFloat(token.value as string); // Ensure numbers are parsed as actual numbers
                break;
            case TokenType.STRING:
                value = token.value;
                break;
            case TokenType.TRUE:
                value = true;
                break;
            case TokenType.FALSE:
                value = false;
                break;
            case TokenType.NULL:
                value = null;
                break;
            default:
                // This case should ideally not be reached if match() works correctly
                throw new ParserError("Expected a literal.", token);
        }
        return { type: NodeType.Literal, value, loc: { line: token.line, column: token.column } }; // Use token's actual loc
    }

    private parsePrimary(): ExpressionNode {
        if (this.match(TokenType.NUMBER, TokenType.STRING, TokenType.TRUE, TokenType.FALSE, TokenType.NULL)) {
            return this.parseLiteral();
        }
        if (this.match(TokenType.IDENTIFIER)) {
            return this.parseIdentifier();
        }
        if (this.match(TokenType.LEFT_BRACKET)) {
            return this.parseArrayLiteral();
        }
        if (this.match(TokenType.LEFT_BRACE)) {
            return this.parseObjectLiteral();
        }
        if (this.match(TokenType.LEFT_PAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RIGHT_PAREN, "Expected ')' after expression.");
            return expr;
        }
        throw new ParserError("Expected an expression.", this.peek());
    }

    // --- Expression Parsing Hierarchy (Ordered by Precedence) ---

    // Handles function calls and member access (e.g., obj.prop, arr[idx], func())
    private parseCall(callee: ExpressionNode): ExpressionNode {
        let expr = callee;
        while (true) {
            if (this.match(TokenType.LEFT_PAREN)) { // This handles function calls: `func()` or `obj.method()`
                expr = this.finishCall(expr);
            } else if (this.match(TokenType.DOT)) { // Handles dot notation: `obj.property`
                const property = this.parseIdentifier(); // Property MUST be an identifier
                expr = { type: NodeType.MemberExpression, object: expr, property, computed: false, loc: this.currentLoc() };
            } else if (this.match(TokenType.LEFT_BRACKET)) { // Handles bracket notation: `obj[expression]`
                const property = this.parseExpression();
                this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after computed member access.");
                expr = { type: NodeType.MemberExpression, object: expr, property, computed: true, loc: this.currentLoc() };
            } else {
                break;
            }
        }
        return expr;
    }

    private finishCall(callee: ExpressionNode): CallExpressionNode {
        const args: ExpressionNode[] = [];
        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                args.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after arguments.");
        return { type: NodeType.CallExpression, callee, args, loc: this.currentLoc() };
    }

    private parseUnary(): ExpressionNode {
        if (this.match(TokenType.BANG, TokenType.MINUS)) {
            const operator = this.previous().value;
            const argument = this.parseUnary();
            return { type: NodeType.UnaryExpression, operator, argument, loc: this.currentLoc() };
        }

        return this.parseCall(this.parsePrimary());
    }

    private parseFactor(): ExpressionNode {
        let expr = this.parseUnary();
        while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
            const operator = this.previous().value;
            const right = this.parseUnary();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseTerm(): ExpressionNode {
        let expr = this.parseFactor();
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const operator = this.previous().value;
            const right = this.parseFactor();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseComparison(): ExpressionNode {
        let expr = this.parseTerm();
        while (this.match(TokenType.LESS, TokenType.LESS_EQUAL, TokenType.GREATER, TokenType.GREATER_EQUAL)) {
            const operator = this.previous().value;
            const right = this.parseTerm();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseEquality(): ExpressionNode {
        let expr = this.parseComparison();
        while (this.match(TokenType.EQUAL_EQUAL, TokenType.BANG_EQUAL)) {
            const operator = this.previous().value;
            const right = this.parseComparison();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseLogicalAnd(): ExpressionNode {
        let expr = this.parseEquality();
        while (this.match(TokenType.AND_AND)) {
            const operator = this.previous().value;
            const right = this.parseEquality();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseLogicalOr(): ExpressionNode {
        let expr = this.parseLogicalAnd();
        while (this.match(TokenType.OR_OR)) {
            const operator = this.previous().value;
            const right = this.parseLogicalAnd();
            expr = { type: NodeType.BinaryExpression, operator, left: expr, right, loc: this.currentLoc() };
        }
        return expr;
    }

    private parseAssignment(): ExpressionNode {
        let expr = this.parseLogicalOr();
        if (this.match(TokenType.EQUAL)) {
            const value = this.parseAssignment();
            if (expr.type === NodeType.Identifier || expr.type === NodeType.MemberExpression) {
                return { type: NodeType.AssignmentExpression, left: expr, right: value, loc: this.currentLoc() };
            }
            throw new ParserError("Invalid assignment target.", this.peek());
        }
        return expr;
    }

    private parseTernary(): ExpressionNode {
        let expr = this.parseAssignment();
        if (this.match(TokenType.QUESTION)) {
            const consequent = this.parseExpression();
            this.consume(TokenType.COLON, "Expected ':' in ternary expression.");
            const alternate = this.parseExpression();
            return { type: NodeType.TernaryExpression, test: expr, consequent, alternate, loc: this.currentLoc() };
        }
        return expr;
    }

    // --- Literals and Data Structures ---
    private parseArrayLiteral(): ArrayLiteralNode {
        const elements: ExpressionNode[] = [];
        if (!this.check(TokenType.RIGHT_BRACKET)) {
            do {
                elements.push(this.parseExpression());
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RIGHT_BRACKET, "Expected ']' after array elements.");
        return { type: NodeType.ArrayLiteral, elements, loc: this.currentLoc() };
    }

    private parseObjectLiteral(): ObjectLiteralNode {
        const properties: PropertyNode[] = [];
        while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) { // Added !this.isAtEnd() for robustness
            const key = this.parseIdentifier(); // Keys are always identifiers
            this.consume(TokenType.COLON, "Expected ':' after key in object.");
            const value = this.parseExpression();
            properties.push({ key, value });
            if (!this.match(TokenType.COMMA)) break; // Stop if no more commas
        }
        this.consume(TokenType.RIGHT_BRACE, "Expected '}' after object literal.");
        return { type: NodeType.ObjectLiteral, properties, loc: this.currentLoc() };
    }

    // --- Statement Parsing ---
    private parseStatement(): StatementNode {
        if (this.check(TokenType.FUN)) {
            this.advance(); // Consume 'fun' keyword
            return this.parseFunctionDeclaration();
        }

        if (this.match(TokenType.LET)) {
            return this.parseVariableDeclaration();
        }
        if (this.match(TokenType.RETURN)) {
            return this.parseReturnStatement();
        }
        if (this.match(TokenType.IF)) {
            return this.parseIfStatement();
        }
        if (this.match(TokenType.WHILE)) {
            return this.parseWhileStatement();
        }
        return this.parseExpressionStatement();
    }

    private parseFunctionDeclaration(): FunctionDeclarationNode {
        const name = this.parseIdentifier();
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after function name.");
        const params: IdentifierNode[] = [];
        if (!this.check(TokenType.RIGHT_PAREN)) {
            do {
                params.push(this.parseIdentifier());
            } while (this.match(TokenType.COMMA));
        }
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after parameters.");
        const body = this.parseBlock();
        return {
            type: NodeType.FunctionDeclaration,
            name,
            params,
            body,
            loc: this.currentLoc()
        };
    }

    private parseVariableDeclaration(): VariableDeclarationNode {
        // const letToken = this.previous(); // Not strictly needed, loc is from currentLoc()
        const name = this.parseIdentifier();
        let initializer: ExpressionNode | null = null;
        if (this.match(TokenType.EQUAL)) {
            initializer = this.parseExpression();
        }
        this.consume(TokenType.SEMICOLON, "Expected ';' after variable declaration.");
        return { type: NodeType.VariableDeclaration, name, initializer, loc: this.currentLoc() };
    }

    private parseReturnStatement(): ReturnStatementNode {
        // const token = this.previous(); // Not strictly needed, loc is from currentLoc()
        const argument = this.check(TokenType.SEMICOLON) ? null : this.parseExpression();
        this.consume(TokenType.SEMICOLON, "Expected ';' after return.");
        return { type: NodeType.ReturnStatement, argument, loc: this.currentLoc() };
    }

    private parseIfStatement(): IfStatementNode {
        // const token = this.previous(); // Not strictly needed, loc is from currentLoc()
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after 'if'.");
        const test = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after if condition.");
        const consequent = this.parseBlock();
        let alternate: BlockStatementNode | null = null;
        if (this.match(TokenType.ELSE)) {
            alternate = this.parseBlock();
        }
        return { type: NodeType.IfStatement, test, consequent, alternate, loc: this.currentLoc() };
    }

    private parseWhileStatement(): WhileStatementNode {
        // const token = this.previous(); // Not strictly needed, loc is from currentLoc()
        this.consume(TokenType.LEFT_PAREN, "Expected '(' after 'while'.");
        const test = this.parseExpression();
        this.consume(TokenType.RIGHT_PAREN, "Expected ')' after condition.");
        const body = this.parseBlock();
        return { type: NodeType.WhileStatement, test, body, loc: this.currentLoc() };
    }

    private parseExpressionStatement(): ExpressionStatementNode {
        const expression = this.parseExpression();
        this.consume(TokenType.SEMICOLON, "Expected ';' after expression.");
        return { type: NodeType.ExpressionStatement, expression, loc: this.currentLoc() };
    }

    private parseBlock(): BlockStatementNode {
        // const token = this.previous(); // Not strictly needed, loc is from currentLoc()
        this.consume(TokenType.LEFT_BRACE, "Expected '{' to start block.");
        const body: StatementNode[] = [];
        while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
            body.push(this.parseStatement());
        }
        this.consume(TokenType.RIGHT_BRACE, "Expected '}' after block.");
        return { type: NodeType.BlockStatement, body, loc: this.currentLoc() };
    }
}