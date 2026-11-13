
export enum TokenType {
    /// "("
    LParen,
    ///")"
    RParen,
    ///"{"
    LBrace,
    ///"}"
    RBrace,
    ///"["
    LSquare,
    ///"]"
    RSquare,
    ///":"
    Colon,
    ///";"
    SemiColon,
    ///","
    Comma,
    ///"."
    Dot,
    ///"?"
    Question,

    ///"+"
    Plus,
    ///"-"
    Minus,
    ///"*"
    Star,
    ///"/"
    Slash,
    ///"="
    Equal,

    ///"+="
    PlusEqual,
    ///"-="
    MinusEqual,
    ///"*="
    StarEqual,
    ///"/="
    SlashEqual,
    ///"!="
    BangEqual,
    ///"=="
    EqualEqual,
    ///"%"
    Mod,
    ///"<"
    Less,
    ///">"
    Greater,
    ///"<="
    LessEqual,
    ///">="
    GreaterEqual,

    Identifier,
    IntLiteral,
    FloatLiteral,
    StringLiteral,

    ///"&&"
    And,
    ///"||"
    Or,
    ///"!"
    Bang,

    ///"&"
    Ampersand,
    ///"|"
    Bar,

    If,
    Else,
    While,
    Extern,
    Func,
    Return,
    Let,
    Const,
    Mut,
    True,
    False,
    None,
    Match,
    Import,
    For,
    In,
    Struct,
    Enum,
    SelfUpper,
    SelfLower,
    Construct,
    Loop,
    Break,
    Continue,
    Await,
    Async,
    Type,
    Static,

    // Access modifier
    Public,

    // End of File
    EoF,
}

export type LiteralTypes =
    { type: "Int", value: number }
    | { type: "Float", value: number }
    | { type: "String", value: String }
    | { type: "Bool", value: boolean }

export class Position {
    line: number;
    column: number;

    constructor () {
        this.line = 1;
        this.column = 1;
    }
}

class Token {
    token_type: TokenType;
    lexeme: string;
    literal: LiteralTypes | null;
    pos: Position;

    constructor (
        token_type: TokenType,
        lexeme: string,
        literal: LiteralTypes | null,
        pos: Position
    ) {
        this.token_type = token_type;
        this.lexeme = lexeme;
        this.literal = literal;
        this.pos = pos;
    }

    to_string(): string {
        return `Token { type: ${this.token_type}, lexeme: ${this.lexeme}, literal: ${this.literal}, position: ${this.pos} }`;
    }
}

export default Token;