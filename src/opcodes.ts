export enum OpCode {
    PUSH = 0x01,
    POP = 0x02,
    DUP = 0x03,
    SWAP = 0x04,

    ADD = 0x10,
    SUB = 0x11,
    MUL = 0x12,
    DIV = 0x13,

    EQ  = 0x20,
    NEQ = 0x21,
    GT  = 0x22,
    LT  = 0x23,
    GTE = 0x24,
    LTE = 0x25,

    JMP  = 0x30,
    JZ   = 0x31,
    JNZ  = 0x32,
    CALL = 0x33,
    RET  = 0x34,
    FUN  = 0x35,

    CONST = 0x40,
    STORE = 0x41,
    LOAD  = 0x42,

    PRINT = 0x50,
    INPUT = 0x51,
    EXIT  = 0x52,

    HALT = 0xF0,
    BREAK = 0xF1,
    CONTINUE = 0xF2,

    ARRAY_CREATE = 0x60,
    ARRAY_GET    = 0x61,
    ARRAY_SET    = 0x62,
}



export const OpcodeName: Record<number, string> = {
    [OpCode.PUSH]: "PUSH",
    [OpCode.POP]: "POP",
    [OpCode.DUP]: "DUP",
    [OpCode.SWAP]: "SWAP",

    [OpCode.ADD]: "ADD",
    [OpCode.SUB]: "SUB",
    [OpCode.MUL]: "MUL",
    [OpCode.DIV]: "DIV",

    [OpCode.EQ ]: "EQ",
    [OpCode.NEQ]: "NEQ",
    [OpCode.GT ]: "GT",
    [OpCode.LT ]: "LT",
    [OpCode.GTE]: "GTE",
    [OpCode.LTE]: "LTE",

    [OpCode.JMP]: "JMP",
    [OpCode.JZ]: "JZ",
    [OpCode.JNZ]: "JNZ",
    [OpCode.CALL]: "CALL",
    [OpCode.RET]: "RET",
    [OpCode.FUN]: "FUN",

    [OpCode.CONST]: "CONST",
    [OpCode.STORE]: "STORE",
    [OpCode.LOAD]: "LOAD",

    [OpCode.PRINT]: "PRINT",
    [OpCode.INPUT]: "INPUT",
    [OpCode.EXIT]: "EXIT",

    [OpCode.HALT]: "HALT",
    [OpCode.BREAK]: "BREAK",
    [OpCode.CONTINUE]: "CONTINUE",

    [OpCode.ARRAY_CREATE]: "ARRAY_CREATE",
    [OpCode.ARRAY_GET]: "ARRAY_GET",
    [OpCode.ARRAY_SET]: "ARRAR_SET",
};
