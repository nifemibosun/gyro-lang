export enum TokenType {
    // Literals
    NUMBER, STRING, IDENTIFIER,

    // Keywords
    FUN, IF, ELSE, WHILE, RETURN,
    TRUE, FALSE, NULL,
    LET,

    // Operators
    PLUS, MINUS, STAR, SLASH, PERCENT,
    EQUAL, EQUAL_EQUAL,
    BANG, BANG_EQUAL,
    GREATER, GREATER_EQUAL,
    LESS, LESS_EQUAL,
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
    type: TokenType;
    value?: any;
    line: number;
    column: number;
}


const keywords: Record<string, TokenType> = {
    'fun': TokenType.FUN,
    'if': TokenType.IF,
    'else': TokenType.ELSE,
    'while': TokenType.WHILE,
    'return': TokenType.RETURN,
    'true': TokenType.TRUE,
    'false': TokenType.FALSE,
    'null': TokenType.NULL,
    'let': TokenType.LET,
};


export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    let line = 1;
    let column = 1;

    const advance = (): string => {
        const char = source[i++];
        if (char === '\n') {
            line++;
            column = 1;
        } else {
            column++;
        }
        return char;
    };

    const peek = (): string => source[i];

    const peekNext = (): string => source[i + 1];

    const isAtEnd = (): boolean => i >= source.length;

    const addToken = (type: TokenType, value?: any, startCol?: number) => {
        const actualStartCol = startCol !== undefined ? startCol : (column - (value?.toString().length || 0) - 1);
        tokens.push({ type, value, line, column: actualStartCol });
    };

    const isDigit = (c: string): boolean => c !== undefined && /\d/.test(c);

    const isAlpha = (c: string): boolean => c !== undefined && /[a-zA-Z_]/.test(c);

    const isAlphaNumeric = (c: string): boolean => isAlpha(c) || isDigit(c);

    while (!isAtEnd()) {
        const startCol = column;
        const c = advance();

        switch (c) {
            case '(': addToken(TokenType.LEFT_PAREN, undefined, startCol); break;
            case ')': addToken(TokenType.RIGHT_PAREN, undefined, startCol); break;
            case '{': addToken(TokenType.LEFT_BRACE, undefined, startCol); break;
            case '}': addToken(TokenType.RIGHT_BRACE, undefined, startCol); break;
            case '[': addToken(TokenType.LEFT_BRACKET, undefined, startCol); break;
            case ']': addToken(TokenType.RIGHT_BRACKET, undefined, startCol); break;
            case ':': addToken(TokenType.COLON, undefined, startCol); break;
            case '?': addToken(TokenType.QUESTION, undefined, startCol); break;
            case ',': addToken(TokenType.COMMA, undefined, startCol); break;
            case '.': addToken(TokenType.DOT, undefined, startCol); break;
            case ';': addToken(TokenType.SEMICOLON, undefined, startCol); break;
            case '+': addToken(TokenType.PLUS, undefined, startCol); break;
            case '-': addToken(TokenType.MINUS, undefined, startCol); break;
            case '*': addToken(TokenType.STAR, undefined, startCol); break;
            case '%': addToken(TokenType.PERCENT, undefined, startCol); break;

            case '!':
                addToken(peek() === '=' ? (advance(), TokenType.BANG_EQUAL) : TokenType.BANG, undefined, startCol);
                break;
            case '=':
                addToken(peek() === '=' ? (advance(), TokenType.EQUAL_EQUAL) : TokenType.EQUAL, undefined, startCol);
                break;
            case '<':
                addToken(peek() === '=' ? (advance(), TokenType.LESS_EQUAL) : TokenType.LESS, undefined, startCol);
                break;
            case '>':
                addToken(peek() === '=' ? (advance(), TokenType.GREATER_EQUAL) : TokenType.GREATER, undefined, startCol);
                break;
            case '&':
                if (peek() === '&') {
                    advance(); addToken(TokenType.AND_AND, undefined, startCol);
                } else {
                    throw new Error(`Lexing Error: Unexpected character '&' at ${line}:${startCol}. Expected '&&'.`);
                }
                break;
            case '|':
                if (peek() === '|') {
                    advance(); addToken(TokenType.OR_OR, undefined, startCol);
                } else {
                    throw new Error(`Lexing Error: Unexpected character '|' at ${line}:${startCol}. Expected '||'.`);
                }
                break;

            case '/':
                if (peek() === '/') {
                    while (!isAtEnd() && peek() !== '\n') advance();
                } else if (peek() === '*') {
                    advance();
                    let foundEndComment = false;
                    while (!isAtEnd()) {
                        if (peek() === '*' && peekNext() === '/') {
                            advance(); advance();
                            foundEndComment = true;
                            break;
                        }
                        advance();
                    }
                    if (!foundEndComment) {
                        throw new Error(`Lexing Error: Unterminated multi-line comment starting at ${line}:${startCol}.`);
                    }
                } else {
                    addToken(TokenType.SLASH, undefined, startCol);
                }
                break;

            case '"': {
                const stringStartCol = startCol;
                let value = '';
                while (!isAtEnd() && peek() !== '"') {
                    const ch = advance();
                    if (ch === '\\') {
                        if (isAtEnd()) throw new Error(`Lexing Error: Unterminated string literal (expected escape char) at ${line}:${column}.`);
                        const esc = advance();
                        value += {
                            n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"'
                        }[esc] || esc;
                    } else {
                        value += ch;
                    }
                }
                if (isAtEnd() && peek() !== '"') {
                    throw new Error(`Lexing Error: Unterminated string literal starting at ${line}:${stringStartCol}.`);
                }
                advance();
                addToken(TokenType.STRING, value, stringStartCol);
                break;
            }

            case '\n': break;
            case ' ':
            case '\t':
            case '\r':
                break;

            default:
                if (isDigit(c)) {
                    let num = c;
                    while (isDigit(peek())) num += advance();
                    if (peek() === '.' && isDigit(peekNext())) {
                        num += advance();
                        while (isDigit(peek())) num += advance();
                    }
                    addToken(TokenType.NUMBER, parseFloat(num), startCol);
                } else if (isAlpha(c)) {
                    let ident = c;
                    while (isAlphaNumeric(peek())) ident += advance();
                    const type = keywords[ident] ?? TokenType.IDENTIFIER;
                    addToken(type, ident, startCol);
                } else {
                    throw new Error(`Lexing Error: Unexpected character '${c}' at ${line}:${startCol}.`);
                }
                break;
        }
    }

    addToken(TokenType.EOF, undefined, column);
    return tokens;
}