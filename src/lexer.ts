export enum TokenType {
    // Literals
    NUMBER, STRING, IDENTIFIER,

    // Keywords - Control Flow
    FUN, IF, ELSE, WHILE, FOR, RETURN, BREAK, CONTINUE,
    TRUE, FALSE, NULL,
    LET, CONST,

    // Type Keywords
    INT, UINT, FLOAT, DOUBLE, STRING_TYPE, BOOL, VOID,
    ARRAY, OBJECT, ANY,

    // Object-Oriented
    CLASS, SELF, EXTENDS, SUPER, CONSTRUCTOR,
    STATIC, PRIVATE, PUBLIC, PROTECTED,

    // Exception Handling
    TRY, CATCH, FINALLY, THROW,

    // Memory Management
    MALLOC, FREE,

    // Import/Export
    IMPORT, EXPORT, FROM, AS,

    // Operators - Arithmetic
    PLUS, MINUS, STAR, SLASH, PERCENT,
    PLUS_PLUS, MINUS_MINUS,
    PLUS_EQUAL, MINUS_EQUAL, STAR_EQUAL, SLASH_EQUAL,

    // Operators - Comparison
    EQUAL, EQUAL_EQUAL, EQUAL_EQUAL_EQUAL,
    BANG, BANG_EQUAL, BANG_EQUAL_EQUAL,
    GREATER, GREATER_EQUAL,
    LESS, LESS_EQUAL,

    // Operators - Logical
    AND_AND, OR_OR,

    // Delimiters
    LEFT_PAREN, RIGHT_PAREN,        // ( )
    LEFT_BRACE, RIGHT_BRACE,        // { }
    LEFT_BRACKET, RIGHT_BRACKET,    // [ ]
    COMMA, DOT, SEMICOLON,          // , . ;
    COLON, QUESTION,                // : ?
    ARROW,                          // =>

    // End of File
    EOF
}

export interface Token {
    type: TokenType;
    value?: any;
    line: number;
    column: number;
    length?: number;
}

export interface Position {
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

    // Type annotations
    'int': TokenType.INT,
    'uint': TokenType.UINT,
    'float': TokenType.FLOAT,
    'double': TokenType.DOUBLE,
    'string': TokenType.STRING_TYPE,
    'bool': TokenType.BOOL,
    'void': TokenType.VOID,
    'array': TokenType.ARRAY,
    'object': TokenType.OBJECT,
    'any': TokenType.ANY,

    // Object-oriented
    'class': TokenType.CLASS,
    'self': TokenType.SELF,
    'extends': TokenType.EXTENDS,
    'super': TokenType.SUPER,
    'constructor': TokenType.CONSTRUCTOR,
    'static': TokenType.STATIC,
    'private': TokenType.PRIVATE,
    'public': TokenType.PUBLIC,
    'protected': TokenType.PROTECTED,

    // Exception handling
    'try': TokenType.TRY,
    'catch': TokenType.CATCH,
    'finally': TokenType.FINALLY,
    'throw': TokenType.THROW,

    // Memory management
    'malloc': TokenType.MALLOC,
    'free': TokenType.FREE,

    // Modules
    'import': TokenType.IMPORT,
    'export': TokenType.EXPORT,
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
            type: TokenType.EOF,
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
            // Single character tokens
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

            // Operators
            case '+':
                if (this.match('+')) {
                    this.addToken(TokenType.PLUS_PLUS, undefined, startCol);
                } else if (this.match('=')) {
                    this.addToken(TokenType.PLUS_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.PLUS, undefined, startCol);
                }
                break;

            case '-':
                if (this.match('-')) {
                    this.addToken(TokenType.MINUS_MINUS, undefined, startCol);
                } else if (this.match('=')) {
                    this.addToken(TokenType.MINUS_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.MINUS, undefined, startCol);
                }
                break;

            case '*':
                this.addToken(this.match('=') ? TokenType.STAR_EQUAL : TokenType.STAR, undefined, startCol);
                break;

            case '%':
                this.addToken(TokenType.PERCENT, undefined, startCol);
                break;

            case '!':
                if (this.match('=')) {
                    if (this.match('=')) {
                        this.addToken(TokenType.BANG_EQUAL_EQUAL, undefined, startCol);
                    } else {
                        this.addToken(TokenType.BANG_EQUAL, undefined, startCol);
                    }
                } else {
                    this.addToken(TokenType.BANG, undefined, startCol);
                }
                break;

            case '=':
                if (this.match('=')) {
                    if (this.match('=')) {
                        this.addToken(TokenType.EQUAL_EQUAL_EQUAL, undefined, startCol);
                    } else {
                        this.addToken(TokenType.EQUAL_EQUAL, undefined, startCol);
                    }
                } else if (this.match('>')) {
                    this.addToken(TokenType.ARROW, undefined, startCol);
                } else {
                    this.addToken(TokenType.EQUAL, undefined, startCol);
                }
                break;

            case '<':
                this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS, undefined, startCol);
                break;

            case '>':
                this.addToken(this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER, undefined, startCol);
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
                    // Line comment
                    while (this.peek() !== '\n' && !this.isAtEnd()) {
                        this.advance();
                    }
                } else if (this.match('*')) {
                    // Block comment
                    this.blockComment();
                } else if (this.match('=')) {
                    this.addToken(TokenType.SLASH_EQUAL, undefined, startCol);
                } else {
                    this.addToken(TokenType.SLASH, undefined, startCol);
                }
                break;

            // String literals
            case '"':
                this.string();
                break;

            // Ignore whitespace
            case ' ':
            case '\r':
            case '\t':
                break;

            case '\n':
                this.line++;
                this.column = 0; // Will be incremented by advance()
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

        // Consume closing "
        this.advance();
        this.addToken(TokenType.STRING, value, startCol);
    }

    private number(): void {
        const startCol = this.column - 1;
        
        while (this.isDigit(this.peek())) {
            this.advance();
        }

        // Look for decimal point
        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance(); // Consume '.'
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
        const type = keywords[text] || TokenType.IDENTIFIER;
        this.addToken(type, text, startCol);
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

    private addToken(type: TokenType, value?: any, startCol?: number): void {
        const actualStartCol = startCol !== undefined ? startCol : this.column;
        const length = this.current - this.start;
        
        this.tokens.push({
            type,
            value,
            line: this.line,
            column: actualStartCol,
            length
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