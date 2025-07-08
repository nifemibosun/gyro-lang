import { OpCode, OpcodeName } from './opcodes.js';
import readline from 'readline';

type GyroValue = number | string | boolean | null | undefined | any[];

interface CallFrame {
  returnIp: number;
  framePointer: number;
  numArgs: number;
}

export class GyroVM {
  private stack: GyroValue[] = [];
  private ip: number = 0; // Instruction Pointer
  private bytecode: number[];
  private constantPool: GyroValue[];
  private running: boolean = true;

  private globals: Map<number, GyroValue> = new Map();

  private callStack: CallFrame[] = [];
  private framePointer: number = 0;

  private rl: readline.Interface | null = null;

  constructor(bytecode: number[], constantPool: GyroValue[] = []) {
    this.bytecode = bytecode;
    this.constantPool = constantPool;
  }

  private ensureStack(needed: number) {
    if (this.stack.length < needed) {
      throw new Error(`Runtime Error: Stack underflow for opcode ${OpcodeName[this.bytecode[this.ip - 1]] || 'UNKNOWN'}. Needed ${needed}, got ${this.stack.length}.`);
    }
  }

  async run(): Promise<GyroValue | undefined> {
    while (this.running && this.ip < this.bytecode.length) {
      const op = this.bytecode[this.ip++];

      switch (op) {
        case OpCode.PUSH_CONST: {
          const constIndex = this.bytecode[this.ip++];
          if (constIndex === undefined || constIndex < 0 || constIndex >= this.constantPool.length) {
              throw new Error(`Runtime Error: Invalid constant pool index ${constIndex} for PUSH_CONST.`);
          }
          this.stack.push(this.constantPool[constIndex]);
          break;
        }
        case OpCode.PUSH_INT: {
            const value = this.bytecode[this.ip++];
            this.stack.push(value);
            break;
        }
        case OpCode.PUSH_FLOAT: {
            const value = this.bytecode[this.ip++];
            this.stack.push(value);
            break;
        }
        case OpCode.PUSH_TRUE: {
            this.stack.push(true);
            break;
        }
        case OpCode.PUSH_FALSE: {
            this.stack.push(false);
            break;
        }
        case OpCode.PUSH_NULL: {
            this.stack.push(null);
            break;
        }

        case OpCode.POP: {
          this.ensureStack(1);
          this.stack.pop();
          break;
        }

        case OpCode.DUP: {
          this.ensureStack(1);
          const top = this.stack[this.stack.length - 1];
          this.stack.push(top);
          break;
        }

        case OpCode.SWAP: {
          this.ensureStack(2);
          const a = this.stack.pop()!;
          const b = this.stack.pop()!;
          this.stack.push(a);
          this.stack.push(b);
          break;
        }

        case OpCode.ADD: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push((a ?? 0) + (b ?? 0));
          break;
        }

        case OpCode.SUB: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push((a ?? 0) - (b ?? 0));
          break;
        }

        case OpCode.MUL: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push((a ?? 0) * (b ?? 0));
          break;
        }

        case OpCode.DIV: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          if (b === 0) throw new Error("Runtime Error: Division by zero.");
          this.stack.push(Math.floor((a ?? 0) / (b ?? 1)));
          break;
        }

        case OpCode.NEG: {
            this.ensureStack(1);
            const val = this.stack.pop() as number;
            this.stack.push(-(val ?? 0));
            break;
        }

        case OpCode.EQ: {
          this.ensureStack(2);
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a === b);
          break;
        }

        case OpCode.NEQ: {
          this.ensureStack(2);
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a !== b);
          break;
        }

        case OpCode.GT: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push(a > b);
          break;
        }

        case OpCode.LT: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push(a < b);
          break;
        }

        case OpCode.GTE: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push(a >= b);
          break;
        }

        case OpCode.LTE: {
          this.ensureStack(2);
          const b = this.stack.pop() as number;
          const a = this.stack.pop() as number;
          this.stack.push(a <= b);
          break;
        }

        case OpCode.NOT: {
            this.ensureStack(1);
            const val = this.stack.pop() as boolean;
            this.stack.push(!val);
            break;
        }

        case OpCode.JMP: {
          const addr = this.bytecode[this.ip++];
          if (addr === undefined || addr < 0 || addr >= this.bytecode.length) {
              throw new Error(`Runtime Error: Invalid jump address ${addr}.`);
          }
          this.ip = addr;
          break;
        }

        case OpCode.JZ: {
          this.ensureStack(1);
          const addr = this.bytecode[this.ip++];
          const cond = this.stack.pop();
          if (addr === undefined || addr < 0 || addr >= this.bytecode.length) {
              throw new Error(`Runtime Error: Invalid jump address ${addr} for JZ.`);
          }
          if (!cond) {
            this.ip = addr;
          }
          break;
        }

        case OpCode.JNZ: {
          this.ensureStack(1);
          const addr = this.bytecode[this.ip++];
          const cond = this.stack.pop();
          if (addr === undefined || addr < 0 || addr >= this.bytecode.length) {
              throw new Error(`Runtime Error: Invalid jump address ${addr} for JNZ.`);
          }
          if (!!cond) {
            this.ip = addr;
          }
          break;
        }

        case OpCode.CALL: {
          const funcAddr = this.bytecode[this.ip++];
          const numArgs = this.bytecode[this.ip++];

          if (funcAddr === undefined || numArgs === undefined || funcAddr < 0 || funcAddr >= this.bytecode.length) {
              throw new Error(`Runtime Error: Invalid CALL operands (function address: ${funcAddr}, num args: ${numArgs}).`);
          }

          this.callStack.push({
            returnIp: this.ip,
            framePointer: this.framePointer,
            numArgs: numArgs,
          });

          this.framePointer = this.stack.length - numArgs;

          this.ip = funcAddr;
          break;
        }

        case OpCode.RET: {
          const returnValue = this.stack.pop();

          if (this.callStack.length === 0) {
            this.running = false;
            this.stack.push(returnValue!);
            break;
          }

          const frame = this.callStack.pop()!;
          this.ip = frame.returnIp;
          this.framePointer = frame.framePointer;

          while (this.stack.length > this.framePointer) {
              this.stack.pop();
          }

          if (returnValue !== undefined) {
            this.stack.push(returnValue);
          }
          break;
        }

        // case OpCode.FUN: {
        //   console.warn('VM encountered FUN opcode. This should be jumped over by compiler-generated JMP or CALL targets.');
        //   break;
        // }

        case OpCode.STORE_GLOBAL: {
          this.ensureStack(1);
          const globalIndex = this.bytecode[this.ip++];
          if (globalIndex === undefined || globalIndex < 0) {
              throw new Error(`Runtime Error: Invalid global index ${globalIndex} for STORE_GLOBAL.`);
          }
          const value = this.stack.pop();
          this.globals.set(globalIndex, value!);
          break;
        }

        case OpCode.LOAD_GLOBAL: {
          const globalIndex = this.bytecode[this.ip++];
          if (globalIndex === undefined || globalIndex < 0) {
              throw new Error(`Runtime Error: Invalid global index ${globalIndex} for LOAD_GLOBAL.`);
          }
          const value = this.globals.get(globalIndex);
          if (value === undefined) {
              throw new Error(`Runtime Error: Attempt to load uninitialized global variable at index ${globalIndex}.`);
          }
          this.stack.push(value);
          break;
        }

        case OpCode.STORE_LOCAL: {
          this.ensureStack(1);
          const offset = this.bytecode[this.ip++];
          if (offset === undefined || offset < 0) {
              throw new Error(`Runtime Error: Invalid local offset ${offset} for STORE_LOCAL.`);
          }
          const value = this.stack.pop();
          this.stack[this.framePointer + offset] = value!;
          break;
        }

        case OpCode.LOAD_LOCAL: {
          const offset = this.bytecode[this.ip++];
          if (offset === undefined || offset < 0) {
              throw new Error(`Runtime Error: Invalid local offset ${offset} for LOAD_LOCAL.`);
          }
          // Check if the stack position exists
          if (this.framePointer + offset >= this.stack.length || this.framePointer + offset < 0) {
              throw new Error(`Runtime Error: Attempt to load local variable out of bounds at offset ${offset} (FP: ${this.framePointer}, StackLen: ${this.stack.length}).`);
          }
          const value = this.stack[this.framePointer + offset];
          if (value === undefined) {
              throw new Error(`Runtime Error: Attempt to load uninitialized local variable at offset ${offset}.`);
          }
          this.stack.push(value);
          break;
        }

        case OpCode.PRINT: {
          this.ensureStack(1);
          console.log(this.stack.pop());
          break;
        }

        case OpCode.INPUT: {
            if (!this.rl) {
                this.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
            }
            process.stdout.write("Input: ");
            const line = await new Promise<string>(resolve => this.rl!.question('', resolve));
            this.stack.push(line);
            break;
        }

        case OpCode.EXIT:
        case OpCode.HALT: {
          this.running = false;
          break;
        }

        case OpCode.ARRAY_CREATE: {
          this.ensureStack(1);
          const size = this.stack.pop() as number;
          if (typeof size !== 'number' || size < 0 || !Number.isInteger(size)) {
            throw new Error(`Runtime Error: ARRAY_CREATE expects a non-negative integer size, got ${size}.`);
          }
          this.stack.push(new Array(size).fill(null));
          break;
        }

        case OpCode.ARRAY_GET: {
          this.ensureStack(2);
          const index = this.stack.pop() as number;
          const arr = this.stack.pop() as GyroValue[];

          if (!Array.isArray(arr)) {
            throw new Error(`Runtime Error: ARRAY_GET expects an array, got ${typeof arr}.`);
          }
          if (typeof index !== 'number' || index < 0 || index >= arr.length || !Number.isInteger(index)) {
            throw new Error(`Runtime Error: Array index out of bounds or invalid: ${index}. Array length: ${arr.length}.`);
          }
          this.stack.push(arr[index]);
          break;
        }

        case OpCode.ARRAY_SET: {
          this.ensureStack(3);
          const value = this.stack.pop();
          const index = this.stack.pop() as number;
          const arr = this.stack.pop() as GyroValue[];

          if (!Array.isArray(arr)) {
            throw new Error(`Runtime Error: ARRAY_SET expects an array, got ${typeof arr}.`);
          }
          if (typeof index !== 'number' || index < 0 || index >= arr.length || !Number.isInteger(index)) {
            throw new Error(`Runtime Error: Array index out of bounds or invalid: ${index}. Array length: ${arr.length}.`);
          }
          arr[index] = value;
          break;
        }

        default: {
          throw new Error(`Unknown opcode: 0x${op.toString(16)} (decimal: ${op}) at IP ${this.ip - 1}.`);
        }
      }
    }

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }

    return this.stack.pop();
  }
}
