import { GyroError } from "../main.js";
import Token, { Position, TokenType, type LiteralTypes } from "./tokens.js";

const keywords: Record<string, TokenType> = {
    // Control flow
    'fun': TokenType.Func,
    'if': TokenType.If,
    'else': TokenType.Else,
    'while': TokenType.While,
    'for': TokenType.For,
    'return': TokenType.Return,
    'break': TokenType.Break,
    'continue': TokenType.Continue,
    'let': TokenType.Let,
    'const': TokenType.Const,

    // Literals
    'true': TokenType.True,
    'false': TokenType.False,
    'none': TokenType.None,

    'class': TokenType.Struct,
    'self': TokenType.SelfLower,
    'Self': TokenType.SelfUpper,
    'construct': TokenType.Construct,
    'static': TokenType.Static,
    'type': TokenType.Type,
    'public': TokenType.Public,
}

class Scanner {
    source: string;
    start: number = 0;
    current: number = 0;
    pos: Position = new Position();
    start_pos: Position = new Position();
    tokens: Token[] = []; 

    constructor(source: string) {
        this.source = source;
    }

    tokenize(): Token[] {
        while(!this.is_at_end()) {
            this.start = this.current;
            this.start_pos = this.pos;
            this.scan_token();
        }

        const eof = new Token(TokenType.EoF, "", null, this.pos);
        this.tokens.push(eof)

        return this.tokens;
    }

    scan_token() {
        const c = this.advance();

        switch (c) {
            case '(': this.add_token(TokenType.LParen); 
                break;
            case ')': this.add_token(TokenType.RParen);
                break;
            case '{': this.add_token(TokenType.LBrace);
                break;
            case '}': this.add_token(TokenType.RBrace);
                break;
            case '[': this.add_token(TokenType.LSquare);
                break;
            case ']': this.add_token(TokenType.RSquare);
                break;
            case ':': this.add_token(TokenType.Colon);
                break;
            case ';': this.add_token(TokenType.SemiColon);
                break;
            case ',': this.add_token(TokenType.Comma);
                break;
            case '.': this.add_token(TokenType.Dot);
                break;
            case '?': this.add_token(TokenType.Question);
                break;
            case '%': this.add_token(TokenType.Mod);
                break;
            case '"': this.string();
                break;
            case '+': this.match_token('=') 
                ? this.add_token(TokenType.PlusEqual) 
                : this.add_token(TokenType.Plus);

                break;
            case '-': this.match_token('=') 
                ? this.add_token(TokenType.MinusEqual) 
                : this.add_token(TokenType.Minus);

                break;
            case '*': this.match_token('=') 
                ? this.add_token(TokenType.StarEqual) 
                : this.add_token(TokenType.Star);

                break;
            case '/': this.match_token('=') 
                ? this.add_token(TokenType.SlashEqual)
                : this.match_token('/')
                    ? this.single_line_comment()
                    :this.add_token(TokenType.Slash);

                break;
            case '=': this.match_token('=') 
                ? this.add_token(TokenType.EqualEqual) 
                : this.add_token(TokenType.Equal);

                break;
            case '<': this.match_token('=') 
                ? this.add_token(TokenType.LessEqual) 
                : this.add_token(TokenType.Less);

                break;
            case '>': this.match_token('=') 
                ? this.add_token(TokenType.GreaterEqual) 
                : this.add_token(TokenType.Greater);

                break;
            case '&': this.match_token('&') 
                ? this.add_token(TokenType.And) 
                : this.add_token(TokenType.Ampersand);

                break;
            case '|': this.match_token('|') 
                ? this.add_token(TokenType.Or) 
                : this.add_token(TokenType.Bar);

                break;
            case '!': this.match_token('=') 
                ? this.add_token(TokenType.BangEqual) 
                : this.add_token(TokenType.Bang);

                break;
            case ' ':
            case '\r':
            case '\t':
            case '\n':
                break;
            default:
                this.is_digit(c) 
                    ? this.number()
                    : this.is_alpha(c)
                        ? this.identifier()
                        : GyroError.new(this.pos, "Unexpected character")
                break;
        }
    }

    advance(): string {
        const char = this.peek();
        this.current++;

        char === '\n'
            ? (   
                this.pos.line += 1,
                this.pos.column = 1
            )
            : (this.pos.column += 1)

        return char;
    }

    peek(): string {
        if (this.is_at_end()) return '\0';
        return this.source[this.current];
    }

    peek_next(): string {
        if (this.current + 1 >= this.source.length) return '\0';
        return this.source[this.current + 1];
    }

    match_token(expected: string): boolean {
        if (this.is_at_end()) return false;
        if (this.peek() != expected) return false;

        this.current += 1;
        return true;
    }

    is_at_end(): boolean {
        return this.current >= this.source.length;
    }

    private is_digit(c: string): boolean {
        return c !== undefined && /\d/.test(c);
    }

    private is_alpha(c: string): boolean {
        return c !== undefined && /[a-zA-Z_]/.test(c);
    }

    private is_alpha_num(c: string): boolean {
        return this.is_alpha(c) || this.is_digit(c);
    }

    private string() {
        while (this.peek() !== '"' && !this.is_at_end()) {
            this.advance();
        }

        if (this.is_at_end()) {
            GyroError.new(this.start_pos, "Unterminated string");
            return;
        }

        this.advance();

        const str = this.source.slice(this.start + 1, this.current - 1);

        this.add_token_with_literal(
            TokenType.StringLiteral,
            { type: 'String', value: str }
        );
    }

    private number() {
        let is_float = false;

        while (this.is_digit(this.peek())) this.advance();

        if (this.peek() === '.' && this.is_digit(this.peek_next())) {
            is_float = true;
            this.advance();

            while (this.is_digit(this.peek())) this.advance();
        }

        const num = this.source.slice(this.start, this.current);;

        is_float
            ? this.add_token_with_literal(
                TokenType.FloatLiteral,
                {type: 'Float', value: Number(num)}
            )
            : this.add_token_with_literal(
                TokenType.IntLiteral,
                {type: 'Int', value: Number(num)}
            );
    }

    identifier() {
        while (this.is_alpha_num(this.peek())) {
            this.advance();
        }

        const text = this.source.slice(this.start, this.current);;
        const type = Object.hasOwn(keywords, text) ? keywords[text] : TokenType.Identifier;
        this.add_token(type)
    }

    single_line_comment() {
        while (this.peek() !== '\n' && !this.is_at_end()) this.advance();
    }

    private add_token_with_literal(token_type: TokenType, literal: LiteralTypes | null) {
        const lexeme = this.source.slice(this.start, this.current);;
        const token = new Token(token_type, lexeme, literal, this.start_pos)

        this.tokens.push(token);
    }

    private add_token(token_type: TokenType) {
        this.add_token_with_literal(token_type, null)
    }
}

export default Scanner;