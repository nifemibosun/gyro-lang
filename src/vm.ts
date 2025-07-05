import { OpCode } from './opcodes.js';

export class GyroVM {
  private stack: any[] = [];
  private ip: number = 0;
  private bytecode: number[];
  private running: boolean = true;
  private memory: Map<number, any> = new Map();

  constructor(bytecode: number[]) {
    this.bytecode = bytecode;
  }

  run() {
    while (this.running && this.ip < this.bytecode.length) {
      const op = this.bytecode[this.ip++];

      switch (op) {
        case OpCode.PUSH: {
          const value = this.bytecode[this.ip++];
          this.stack.push(value);
          break;
        }

        case OpCode.POP: {
          this.stack.pop();
          break;
        }

        case OpCode.DUP: {
          const top = this.stack[this.stack.length - 1];
          this.stack.push(top);
          break;
        }

        case OpCode.SWAP: {
          const a = this.stack.pop();
          const b = this.stack.pop();
          if (a !== undefined && b !== undefined) {
            this.stack.push(a);
            this.stack.push(b);
          }
          break;
        }

        case OpCode.ADD: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push((a ?? 0) + (b ?? 0));
          break;
        }

        case OpCode.SUB: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push((a ?? 0) - (b ?? 0));
          break;
        }

        case OpCode.MUL: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push((a ?? 0) * (b ?? 0));
          break;
        }

        case OpCode.DIV: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(Math.floor((a ?? 0) / (b ?? 1)));
          break;
        }

        case OpCode.EQ: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a === b ? 1 : 0);
          break;
        }

        case OpCode.NEQ: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a !== b ? 1 : 0);
          break;
        }

        case OpCode.GT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a > b ? 1 : 0);
          break;
        }

        case OpCode.LT: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a < b ? 1 : 0);
          break;
        }

        case OpCode.GTE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a >= b ? 1 : 0);
          break;
        }

        case OpCode.LTE: {
          const b = this.stack.pop();
          const a = this.stack.pop();
          this.stack.push(a <= b ? 1 : 0);
          break;
        }

        case OpCode.JMP: {
          const addr = this.bytecode[this.ip++];
          this.ip = addr;
          break;
        }

        case OpCode.JZ: {
          const addr = this.bytecode[this.ip++];
          const cond = this.stack.pop();
          if (cond === 0) this.ip = addr;
          break;
        }

        case OpCode.JNZ: {
          const addr = this.bytecode[this.ip++];
          const cond = this.stack.pop();
          if (cond !== 0) this.ip = addr;
          break;
        }

        case OpCode.CALL: {
          console.warn('CALL not implemented fully');
          break;
        }

        case OpCode.RET: {
          this.running = false;
          break;
        }

        case OpCode.FUN: {
          console.warn('FUN declaration skipped in runtime');
          break;
        }

        case OpCode.CONST:
        case OpCode.STORE: {
          const addr = this.bytecode[this.ip++];
          const value = this.stack.pop();
          this.memory.set(addr, value);
          break;
        }

        case OpCode.LOAD: {
          const addr = this.bytecode[this.ip++];
          const value = this.memory.get(addr);
          this.stack.push(value);
          break;
        }

        case OpCode.PRINT: {
          console.log(this.stack.pop());
          break;
        }

        case OpCode.INPUT: {
          console.warn('INPUT not implemented');
          break;
        }

        case OpCode.EXIT:
        case OpCode.HALT: {
          this.running = false;
          break;
        }

        case OpCode.BREAK:
        case OpCode.CONTINUE: {
          console.warn('BREAK/CONTINUE only work in loop contexts');
          break;
        }

        case OpCode.ARRAY_CREATE: {
          const size = this.stack.pop();
          this.stack.push(new Array(size).fill(0));
          break;
        }

        case OpCode.ARRAY_GET: {
          const index = this.stack.pop();
          const arr = this.stack.pop();
          this.stack.push(arr?.[index]);
          break;
        }

        case OpCode.ARRAY_SET: {
          const value = this.stack.pop();
          const index = this.stack.pop();
          const arr = this.stack.pop();
          if (Array.isArray(arr)) arr[index] = value;
          break;
        }

        default: {
          throw new Error(`Unknown opcode: 0x${op.toString(16)}`);
        }
      }
    }
  }
}
