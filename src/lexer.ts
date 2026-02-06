export enum TokenType {
    // Literals
    NUMBER, STRING, IDENTIFIER,

    // Keywords - Control Flow
    FUN, IF, ELSE, WHILE, FOR, RETURN, BREAK, CONTINUE,
    TRUE, FALSE, NULL,
    LET, CONST,

    ARRAY, OBJECT, ANY,

    // Object-Oriented
    CLASS, SELF, CONSTRUCTOR,
    PUBLIC, STATIC,

    // Exception Handling
    TRY, CATCH, FINALLY, THROW,

    // Module System
    IMPORT, FROM, AS,

    // Operators - Arithmetic
    PLUS, MINUS, STAR, SLASH, PERCENT,
    PLUS_EQUAL, MINUS_EQUAL, STAR_EQUAL, SLASH_EQUAL,

    // Operators - Comparison
    EQUAL, EQUAL_EQUAL,
    BANG, BANG_EQUAL,
    GREATER, GREATER_EQUAL,
    LESS, LESS_EQUAL,

    // Operators - Logical
    AND_AND, OR_OR,

    // Delimiters
    LEFT_PAREN, RIGHT_PAREN,
    LEFT_BRACE, RIGHT_BRACE,
    LEFT_BRACKET, RIGHT_BRACKET,
    COMMA, DOT, SEMICOLON,
    COLON, QUESTION,

    // End of File
    EOF
}

export interface Token {
    t_type: TokenType;
    value?: any;
    line: number;
    column: number;
}

const keywords: Record<string, TokenType> = {
    // Control flow
    'fun': TokenType.FUN,
    'if': TokenType.IF,
    'else': TokenType.ELSE,
    'while': TokenType.WHILE,
    'for': TokenType.FOR,
    'return': TokenType.RETURN,
    'break': TokenType.BREAK,
    'continue': TokenType.CONTINUE,
    'let': TokenType.LET,
    'const': TokenType.CONST,

    // Literals
    'true': TokenType.TRUE,
    'false': TokenType.FALSE,
    'null': TokenType.NULL,

    // 'array': TokenType.ARRAY,
    // 'object': TokenType.OBJECT,
    // 'any': TokenType.ANY,

    // Object-oriented
    'class': TokenType.CLASS,
    'self': TokenType.SELF,
    'constructor': TokenType.CONSTRUCTOR,
    'static': TokenType.STATIC,
    'public': TokenType.PUBLIC,

    // Exception handling
    'try': TokenType.TRY,
    'catch': TokenType.CATCH,
    'finally': TokenType.FINALLY,
    'throw': TokenType.THROW,

    // Module system
    'import': TokenType.IMPORT,
    'from': TokenType.FROM,
    'as': TokenType.AS,
};

export class GyroLexer {
    private source: string;
    private tokens: Token[] = [];
    private start = 0;
    private current = 0;
    private line = 1;
    private column = 1;

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }

        this.tokens.push({
            t_type: TokenType.EOF,
            line: this.line,
            column: this.column
        });
        
        return this.tokens;
    }

    private isAtEnd(): boolean {
        return this.current >= this.source.length;
    }

    private scanToken(): void {
        const startCol = this.column;
        const c = this.advance();

        switch (c) {
            case '(': this.addToken(TokenType.LEFT_PAREN, undefined, startCol); break;
            case ')': this.addToken(TokenType.RIGHT_PAREN, undefined, startCol); break;
            case '{': this.addToken(TokenType.LEFT_BRACE, undefined, startCol); break;
            case '}': this.addToken(TokenType.RIGHT_BRACE, undefined, startCol); break;
            case '[': this.addToken(TokenType.LEFT_BRACKET, undefined, startCol); break;
            case ']': this.addToken(TokenType.RIGHT_BRACKET, undefined, startCol); break;
            case ',': this.addToken(TokenType.COMMA, undefined, startCol); break;
            case '.': this.addToken(TokenType.DOT, undefined, startCol); break;
            case ';': this.addToken(TokenType.SEMICOLON, undefined, startCol); break;
            case ':': this.addToken(TokenType.COLON, undefined, startCol); break;
            case '?': this.addToken(TokenType.QUESTION, undefined, startCol); break;
            case '%': this.addToken(TokenType.PERCENT, undefined, startCol); break;

            case '+':
                if (this.match('=')) {
                    this.addToken(TokenType.PLUS_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.PLUS, undefined, startCol);
                }
                break;

            case '-':
                if (this.match('=')) {
                    this.addToken(TokenType.MINUS_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.MINUS, undefined, startCol);
                }
                break;

            case '*':
                if (this.match('=')) {
                    this.addToken(TokenType.STAR_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.STAR, undefined, startCol);
                }
                break;

            case '!':
                if (this.match('=')) {
                    this.addToken(TokenType.BANG_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.BANG, undefined, startCol);
                }
                break;

            case '=':
                if (this.match('=')) {
                    this.addToken(TokenType.EQUAL_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.EQUAL, undefined, startCol);
                }
                break;

            case '<':
                if (this.match('=')) {
                    this.addToken(TokenType.LESS_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.LESS, undefined, startCol);
                }
                break;

            case '>':
                if (this.match('=')) {
                    this.addToken(TokenType.GREATER_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.GREATER, undefined, startCol);
                }
                break;

            case '&':
                if (this.match('&')) {
                    this.addToken(TokenType.AND_AND, undefined, startCol);
                } else {
                    this.error(`Unexpected character '&' at ${this.line}:${startCol}. Expected '&&'.`);
                }
                break;

            case '|':
                if (this.match('|')) {
                    this.addToken(TokenType.OR_OR, undefined, startCol);
                } else {
                    this.error(`Unexpected character '|' at ${this.line}:${startCol}. Expected '||'.`);
                }
                break;

            case '/':
                if (this.match('/')) {
                    while (this.peek() !== '\n' && !this.isAtEnd()) {
                        this.advance();
                    }
                } else if (this.match('*')) {
                    this.blockComment();
                } else if (this.match('=')) {
                    this.addToken(TokenType.SLASH_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.SLASH, undefined, startCol);
                }
                break;

            case '"':
                this.string();
                break;

            case ' ':
            case '\r':
            case '\t':
                break;

            case '\n':
                this.line++;
                this.column = 1;
                break;

            default:
                if (this.isDigit(c)) {
                    this.number();
                } else if (this.isAlpha(c)) {
                    this.identifier();
                } else {
                    this.error(`Unexpected character '${c}' at ${this.line}:${startCol}`);
                }
                break;
        }
    }

    private advance(): string {
        const char = this.source[this.current++];
        this.column++;
        return char;
    }

    private match(expected: string): boolean {
        if (this.isAtEnd()) return false;
        if (this.source[this.current] !== expected) return false;
        this.current++;
        this.column++;
        return true;
    }

    private peek(): string {
        if (this.isAtEnd()) return '\0';
        return this.source[this.current];
    }

    private peekNext(): string {
        if (this.current + 1 >= this.source.length) return '\0';
        return this.source[this.current + 1];
    }

    private string(): void {
        const startCol = this.column - 1;
        let value = '';

        while (this.peek() !== '"' && !this.isAtEnd()) {
            const c = this.advance();
            if (c === '\\') {
                if (this.isAtEnd()) {
                    this.error(`Unterminated string literal at ${this.line}:${startCol}`);
                    return;
                }
                const escaped = this.advance();
                const escapeMap: Record<string, string> = {
                    'n': '\n',
                    't': '\t',
                    'r': '\r',
                    '\\': '\\',
                    '"': '"',
                    '0': '\0'
                };
                value += escapeMap[escaped] || escaped;
            } else {
                if (c === '\n') {
                    this.line++;
                    this.column = 1;
                }
                value += c;
            }
        }

        if (this.isAtEnd()) {
            this.error(`Unterminated string literal at ${this.line}:${startCol}`);
            return;
        }

        this.advance();
        this.addToken(TokenType.STRING, value, startCol);
    }

    private number(): void {
        const startCol = this.column - 1;
        
        while (this.isDigit(this.peek())) {
            this.advance();
        }

        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance();
            while (this.isDigit(this.peek())) {
                this.advance();
            }
        }

        const value = this.source.substring(this.start, this.current);
        this.addToken(TokenType.NUMBER, parseFloat(value), startCol);
    }

    private identifier(): void {
        const startCol = this.column - (this.current - this.start);
        
        while (this.isAlphaNumeric(this.peek())) {
            this.advance();
        }

        const text = this.source.substring(this.start, this.current);
        const t_type = keywords[text] || TokenType.IDENTIFIER;
        this.addToken(t_type, text, startCol);
    }

    private blockComment(): void {
        let depth = 1;
        
        while (depth > 0 && !this.isAtEnd()) {
            if (this.peek() === '/' && this.peekNext() === '*') {
                this.advance();
                this.advance();
                depth++;
            } else if (this.peek() === '*' && this.peekNext() === '/') {
                this.advance();
                this.advance();
                depth--;
            } else {
                const c = this.advance();
                if (c === '\n') {
                    this.line++;
                    this.column = 1;
                }
            }
        }

        if (depth > 0) {
            this.error(`Unterminated block comment starting at line ${this.line}`);
        }
    }

    private isDigit(c: string): boolean {
        return c !== undefined && /\d/.test(c);
    }

    private isAlpha(c: string): boolean {
        return c !== undefined && /[a-zA-Z_]/.test(c);
    }

    private isAlphaNumeric(c: string): boolean {
        return this.isAlpha(c) || this.isDigit(c);
    }

    private addToken(t_type: TokenType, value?: any, startCol?: number): void {
        const actualStartCol = startCol !== undefined ? startCol : this.column;
        
        this.tokens.push({
            t_type,
            value,
            line: this.line,
            column: actualStartCol,
        });
    }

    private error(message: string): void {
        throw new Error(`Lexer Error: ${message}`);
    }
}

export function tokenize(source: string): Token[] {
    const lexer = new GyroLexer(source);
    return lexer.tokenize();
}