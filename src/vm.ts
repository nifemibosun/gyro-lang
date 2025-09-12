import { OpCode, OpcodeName } from './opcodes.js';
// @ts-ignore
import readline from 'readline';
// @ts-ignore
import * as net from 'net';
// @ts-ignore
import process from 'process';


type GyroValue = number | string | boolean | null | undefined | any[] | GyroObject | GyroPointer;

interface GyroObject {
  className: string;
  fields: Map<string, GyroValue>;
}

interface GyroPointer {
  address: number;
  size: number;
}

interface GyroClass {
  name: string;
  fields: string[];
  methods: Map<string, number>;
}

interface CallFrame {
  returnIp: number;
  framePointer: number;
  numArgs: number;
  thisObject?: GyroObject;
}

interface ExceptionHandler {
  tryStart: number;
  tryEnd: number;
  catchStart: number;
  finallyStart?: number;
}

interface MemoryBlock {
  data: GyroValue[];
  allocated: boolean;
}

export class GyroVM {
  private stack: GyroValue[] = [];
  private ip = 0;
  private bytecode: number[];
  private constantPool: GyroValue[];
  private cliArgs: string[];
  private classes: Map<string, GyroClass> = new Map();
  private running = true;

  private globals = new Map<number, GyroValue>();
  private callStack: CallFrame[] = [];
  private framePointer = 0;
  private exceptionHandlers: ExceptionHandler[] = [];
  private currentException: GyroValue = null;

  private memory: Map<number, MemoryBlock> = new Map();
  private nextMemoryAddress = 1000;

  private sockets: Map<number, net.Socket | net.Server> = new Map();
  private nextSocketId = 1;

  private rl: readline.Interface | null = null;

  constructor(gbc: any, cliArgs: string[] = []) {
    this.bytecode = gbc.bytecode || [];
    this.constantPool = gbc.constantPool || [];
    this.cliArgs = Array.isArray(cliArgs) ? cliArgs.slice() : [];
    
    if (gbc.classes) {
      for (const classDef of gbc.classes) {
        const gyroClass: GyroClass = {
          name: classDef.name,
          fields: classDef.fields || [],
          methods: new Map()
        };
        
        if (classDef.methods) {
          for (const method of classDef.methods) {
            gyroClass.methods.set(method.name, method.address);
          }
        }
        
        this.classes.set(classDef.name, gyroClass);
      }
    }

    if (gbc.exceptionHandlers) {
      this.exceptionHandlers = gbc.exceptionHandlers;
    }
  }

  private ensureStack(size: number) {
    if (this.stack.length < size) {
      const opcode = this.bytecode[Math.max(0, this.ip - 1)];
      const name = OpcodeName[opcode] || `OP_${opcode}`;
      throw new Error(`Stack underflow at ip=${this.ip - 1} (${name}), need ${size}, got ${this.stack.length}`);
    }
  }

  private ensureIpAvailable(n: number) {
    if (this.ip + n - 1 >= this.bytecode.length) {
      throw new Error(`Unexpected EOF: need ${n} bytes at ip=${this.ip}`);
    }
  }

  private readByte(): number {
    this.ensureIpAvailable(1);
    return this.bytecode[this.ip++];
  }

  private readShort(): number {
    this.ensureIpAvailable(2);
    const hi = this.bytecode[this.ip++];
    const lo = this.bytecode[this.ip++];
    return (hi << 8) | lo;
  }

  private allocateMemory(size: number): number {
    const address = this.nextMemoryAddress++;
    this.memory.set(address, {
      data: new Array(size).fill(null),
      allocated: true
    });
    return address;
  }

  private freeMemory(address: number): void {
    const block = this.memory.get(address);
    if (block) {
      block.allocated = false;
      block.data.fill(null);
    }
  }

  private findExceptionHandler(ip: number): ExceptionHandler | null {
    let best: ExceptionHandler | null = null;
    for (const h of this.exceptionHandlers) {
      if (ip >= h.tryStart && ip <= h.tryEnd) {
        if (!best || h.tryStart > best.tryStart) best = h;
      }
    }
    return best;
  }

  private pop<T extends GyroValue>(): T {
    this.ensureStack(1);
    return this.stack.pop() as T;
  }

  async run(): Promise<GyroValue | undefined> {
    while (this.running && this.ip < this.bytecode.length) {
      try {
        const op = this.readByte();

        switch (op) {
          case OpCode.PUSH_CONST:
            this.stack.push(this.constantPool[this.readByte()]);
            break;

          case OpCode.PUSH_INT:
          case OpCode.PUSH_FLOAT:
            this.stack.push(this.readByte());
            break;

          case OpCode.PUSH_TRUE:
            this.stack.push(true);
            break;

          case OpCode.PUSH_FALSE:
            this.stack.push(false);
            break;

          case OpCode.PUSH_NULL:
            this.stack.push(null);
            break;

          case OpCode.POP:
            this.ensureStack(1);
            this.pop();
            break;

          case OpCode.DUP:
            this.ensureStack(1);
            this.stack.push(this.stack[this.stack.length - 1]);
            break;

          case OpCode.SWAP:
            this.ensureStack(2);
            const top = this.pop()!;
            const below = this.pop()!;
            this.stack.push(top, below);
            break;

          case OpCode.ADD:
          case OpCode.SUB:
          case OpCode.MUL:
          case OpCode.DIV: {
            this.ensureStack(2);
            const b = this.pop<number>();
            const a = this.pop<number>() as number;
            let result = 0;
            switch (op) {
              case OpCode.ADD: result = a + b; break;
              case OpCode.SUB: result = a - b; break;
              case OpCode.MUL: result = a * b; break;
              case OpCode.DIV:
                if (b === 0) throw new Error("Division by zero");
                result = Math.floor(a / b);
                break;
            }
            this.stack.push(result);
            break;
          }

          case OpCode.MOD:
            this.ensureStack(2);
            const modB = this.pop<number>();
            const modA = this.pop<number>() as number;
            this.stack.push(modA % modB);
            break;

          case OpCode.NEG:
            this.ensureStack(1);
            this.stack.push(-(this.pop<number>()));
            break;

          case OpCode.NOT:
            this.ensureStack(1);
            this.stack.push(!this.pop());
            break;

          case OpCode.EQ:
          case OpCode.NEQ:
          case OpCode.GT:
          case OpCode.GTE:
          case OpCode.LT:
          case OpCode.LTE: {
            this.ensureStack(2);
            const right = this.pop();
            const left = this.pop();
            let bool = false;
            switch (op) {
              case OpCode.EQ: bool = left === right; break;
              case OpCode.NEQ: bool = left !== right; break;
              case OpCode.GT: bool = (left as number) > (right as number); break;
              case OpCode.GTE: bool = (left as number) >= (right as number); break;
              case OpCode.LT: bool = (left as number) < (right as number); break;
              case OpCode.LTE: bool = (left as number) <= (right as number); break;
            }
            this.stack.push(bool);
            break;
          }

          case OpCode.JMP:
            this.ip = this.readByte();
            break;

          case OpCode.JZ:
          case OpCode.JNZ: {
            const addr = this.readByte();
            const cond = this.pop();
            const isTrue = !!cond;
            if ((op === OpCode.JZ && !isTrue) || (op === OpCode.JNZ && isTrue)) {
              this.ip = addr;
            }
            break;
          }

          case OpCode.CALL: {
            const addr = this.readByte();
            const numArgs = this.readByte();
            this.callStack.push({ returnIp: this.ip, framePointer: this.framePointer, numArgs });
            this.framePointer = this.stack.length - numArgs;
            this.ip = addr;
            break;
          }

          case OpCode.RET: {
            const retVal = this.pop();
            const frame = this.callStack.pop();
            if (!frame) {
              this.running = false;
              this.stack.push(retVal);
              break;
            }
            this.ip = frame.returnIp;
            this.framePointer = frame.framePointer;
            while (this.stack.length > this.framePointer) this.pop();
            this.stack.push(retVal);
            break;
          }

          case OpCode.STORE_LOCAL:
          case OpCode.LOAD_LOCAL: {
            const offset = this.readByte();
            const index = this.framePointer + offset;
            if (index < 0 || index >= this.stack.length) {
              throw new Error(`Local variable access out of bounds at offset ${offset}`);
            }
            if (op === OpCode.STORE_LOCAL) {
              this.stack[index] = this.pop();
            } else {
              this.stack.push(this.stack[index]);
            }
            break;
          }

          case OpCode.STORE_GLOBAL:
            this.globals.set(this.readByte(), this.pop());
            break;

          case OpCode.LOAD_GLOBAL: {
            const index = this.readByte();
            const value = this.globals.get(index);
            if (value === undefined) throw new Error(`Access to uninitialized global at index ${index}`);
            this.stack.push(value);
            break;
          }

          case OpCode.LOAD_ARGS: {
            const arr = this.cliArgs.slice();
            this.stack.push(arr);
            break;
          }

          case OpCode.PRINT_LN:
            this.ensureStack(1);
            console.log(this.pop());
            this.stack.push(null);
            break;

          case OpCode.INPUT: {
            if (!this.rl) {
              this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            }
            process.stdout.write("Input: ");
            const input = await new Promise<string>(res => this.rl!.question('', res));
            this.stack.push(input);
            break;
          }

          case OpCode.ARRAY_CREATE: {
            this.ensureStack(1);
            const size = this.pop();
            if (typeof size !== 'number' || size < 0 || !Number.isInteger(size)) {
              throw new Error(`Invalid array size: ${size}`);
            }
            this.stack.push(new Array(size).fill(null));
            break;
          }

          case OpCode.ARRAY_GET: {
            this.ensureStack(2);
            const index = this.pop<number>();
            const arr = this.pop();
            if (!Array.isArray(arr)) throw new Error("ARRAY_GET expects an array");
            this.stack.push(arr[index]);
            break;
          }

          case OpCode.ARRAY_SET: {
            this.ensureStack(3);
            const value = this.pop();
            const index = this.pop<number>();
            const arr = this.pop();
            if (!Array.isArray(arr)) throw new Error("ARRAY_SET expects an array");
            arr[index] = value;
            break;
          }

          case OpCode.STRING_CONCAT: {
            this.ensureStack(2);
            const b = this.pop();
            const a = this.pop();
            this.stack.push(String(a) + String(b));
            break;
          }

          case OpCode.STRING_LENGTH: {
            this.ensureStack(1);
            const str = this.pop();
            if (typeof str !== 'string') throw new Error("STRING_LENGTH expects a string");
            this.stack.push(str.length);
            break;
          }

          case OpCode.STRING_SUBSTR: {
            this.ensureStack(3);
            const end = this.pop<number>();
            const start = this.pop<number>();
            const str = this.pop();
            if (typeof str !== 'string') throw new Error("STRING_SUBSTR expects a string");
            this.stack.push(str.substring(start, end));
            break;
          }

          case OpCode.STRING_CHAR_AT: {
            this.ensureStack(2);
            const index = this.pop<number>();
            const str = this.pop();
            if (typeof str !== 'string') throw new Error("STRING_CHAR_AT expects a string");
            this.stack.push(str.charAt(index));
            break;
          }

          case OpCode.STRING_INDEX_OF: {
            this.ensureStack(2);
            const searchStr = this.pop();
            const str = this.pop();
            if (typeof str !== 'string' || typeof searchStr !== 'string') {
              throw new Error("STRING_INDEX_OF expects two strings");
            }
            this.stack.push(str.indexOf(searchStr));
            break;
          }

          case OpCode.STRING_TO_INT: {
            this.ensureStack(1);
            const str = this.pop();
            if (typeof str !== 'string') throw new Error("STRING_TO_INT expects a string");
            const num = parseInt(str, 10);
            this.stack.push(isNaN(num) ? 0 : num);
            break;
          }

          case OpCode.INT_TO_STRING: {
            this.ensureStack(1);
            const num = this.pop();
            if (typeof num !== 'number') throw new Error("INT_TO_STRING expects a number");
            this.stack.push(String(num));
            break;
          }

          case OpCode.STRING_COMPARE: {
            this.ensureStack(2);
            const b = this.pop();
            const a = this.pop();
            if (typeof a !== 'string' || typeof b !== 'string') {
              throw new Error("STRING_COMPARE expects two strings");
            }
            this.stack.push(a < b ? -1 : a > b ? 1 : 0);
            break;
          }

          case OpCode.CLASS_DEF: {
            const classIndex = this.readByte();
            break;
          }

          case OpCode.OBJECT_NEW: {
            this.ensureStack(1);
            const className = this.pop() as string;
            const classDef = this.classes.get(className);
            if (!classDef) throw new Error(`Unknown class: ${className}`);
            
            const obj: GyroObject = {
              className,
              fields: new Map()
            };
            
            for (const field of classDef.fields) {
              obj.fields.set(field, null);
            }
            
            this.stack.push(obj);
            break;
          }

          case OpCode.FIELD_GET: {
            this.ensureStack(2);
            const fieldName = this.pop() as string;
            const obj = this.pop() as GyroObject;
            if (!obj || typeof obj !== 'object' || !('className' in obj)) {
              throw new Error("FIELD_GET expects an object");
            }
            const value = obj.fields.get(fieldName);
            this.stack.push(value);
            break;
          }

          case OpCode.FIELD_SET: {
            this.ensureStack(3);
            const value = this.pop();
            const fieldName = this.pop() as string;
            const obj = this.pop() as GyroObject;
            if (!obj || typeof obj !== 'object' || !('className' in obj)) {
              throw new Error("FIELD_SET expects an object");
            }
            obj.fields.set(fieldName, value);
            break;
          }

          case OpCode.METHOD_CALL: {
            const methodName = this.constantPool[this.readByte()] as string;
            const numArgs = this.readByte();
            this.ensureStack(numArgs + 1);
            
            const obj = this.stack[this.stack.length - numArgs - 1] as GyroObject;
            if (!obj || typeof obj !== 'object' || !('className' in obj)) {
              throw new Error("METHOD_CALL expects an object");
            }
            
            const classDef = this.classes.get(obj.className);
            const methodAddr = classDef?.methods.get(methodName);
            if (methodAddr === undefined) {
              throw new Error(`Method ${methodName} not found in class ${obj.className}`);
            }
            
            this.callStack.push({ 
              returnIp: this.ip, 
              framePointer: this.framePointer, 
              numArgs,
              thisObject: obj
            });
            this.framePointer = this.stack.length - numArgs;
            this.ip = methodAddr;
            break;
          }

          case OpCode.INSTANCEOF: {
            this.ensureStack(2);
            const className = this.pop() as string;
            const obj = this.pop();
            const result = obj && typeof obj === 'object' && 
                          'className' in obj && 
                          (obj as GyroObject).className === className;
            this.stack.push(result);
            break;
          }

          case OpCode.MALLOC: {
            this.ensureStack(1);
            const size = this.pop<number>();
            if (typeof size !== 'number' || size <= 0) {
              throw new Error("MALLOC expects positive size");
            }
            const address = this.allocateMemory(size);
            this.stack.push({ address, size } as GyroPointer);
            break;
          }

          case OpCode.FREE: {
            this.ensureStack(1);
            const ptr = this.pop() as GyroPointer;
            if (!ptr || typeof ptr !== 'object' || !('address' in ptr)) {
              throw new Error("FREE expects a pointer");
            }
            this.freeMemory(ptr.address);
            break;
          }

          case OpCode.MEMCPY: {
            this.ensureStack(3);
            const size = this.pop<number>();
            const src = this.pop<GyroPointer>();
            const dest = this.pop<GyroPointer>();

            const srcBlock = this.memory.get(src.address);
            const destBlock = this.memory.get(dest.address);

            if (!srcBlock || !srcBlock.allocated || !destBlock || !destBlock.allocated) {
              throw new Error("MEMCPY: Invalid or freed memory");
            }

            if (size < 0 || size > srcBlock.data.length || size > destBlock.data.length) {
              throw new Error("MEMCPY: Out of bounds");
            }

            for (let i = 0; i < size; i++) {
              destBlock.data[i] = srcBlock.data[i];
            }
            break;
          }

          case OpCode.PTR_GET: {
            this.ensureStack(2);
            const offset = this.pop<number>();
            const ptr = this.pop() as GyroPointer;
            const block = this.memory.get(ptr.address);
            if (!block || !block.allocated) {
              throw new Error("PTR_GET: Invalid or freed memory address");
            }
            if (offset < 0 || offset >= block.data.length) {
              throw new Error("PTR_GET: Out of bounds");
            }
            this.stack.push(block.data[offset]);
            break;
          }

          case OpCode.PTR_SET: {
            this.ensureStack(3);
            const value = this.pop();
            const offset = this.pop<number>();
            const ptr = this.pop() as GyroPointer;
            const block = this.memory.get(ptr.address);
            if (!block || !block.allocated) {
              throw new Error("PTR_SET: Invalid or freed memory address");
            }
            if (offset < 0 || offset >= block.data.length) {
              throw new Error("PTR_SET: Out of bounds");
            }
            block.data[offset] = value;
            break;
          }

          case OpCode.SOCKET_CREATE: {
            const socket = new net.Socket();
            const id = this.nextSocketId++;
            this.sockets.set(id, socket);
            this.stack.push(id);
            break;
          }

          case OpCode.SOCKET_BIND: {
            this.ensureStack(2);
            const port = this.pop<number>();
            const socketId = this.pop<number>();
            
            const server = net.createServer();
            server.listen(port);
            this.sockets.set(socketId, server);
            this.stack.push(true);
            break;
          }

          case OpCode.SOCKET_LISTEN: {
            this.ensureStack(1);
            const socketId = this.pop<number>();
            const server = this.sockets.get(socketId) as net.Server;
            if (!server) throw new Error("Invalid socket ID");
            this.stack.push(true);
            break;
          }

          case OpCode.SOCKET_SEND: {
            this.ensureStack(2);
            const data = this.pop() as string;
            const socketId = this.pop<number>();
            const socket = this.sockets.get(socketId) as net.Socket;
            if (!socket) throw new Error("Invalid socket ID");
            socket.write(typeof data === 'string' ? data : String(data));
            this.stack.push(true);
            break;
          }

          case OpCode.SOCKET_CLOSE: {
            this.ensureStack(1);
            const socketId = this.pop<number>();
            const socket = this.sockets.get(socketId);
            if (socket) {
              if ('close' in socket) socket.close();
              else socket.destroy();
              this.sockets.delete(socketId);
            }
            this.stack.push(true);
            break;
          }

          case OpCode.TRY_BEGIN: {
            const tryStart = this.ip;
            const tryEnd = this.readShort();
            const catchStart = this.readShort();
            const finallyStart = this.readShort();
            
            this.exceptionHandlers.push({
              tryStart,
              tryEnd,
              catchStart,
              finallyStart: finallyStart === 0 ? undefined : finallyStart
            });
            break;
          }

          case OpCode.TRY_END: {
            this.exceptionHandlers.pop();
            break;
          }

          case OpCode.THROW: {
            this.ensureStack(1);
            const exception = this.pop();
            this.currentException = exception;
            
            const handler = this.findExceptionHandler(this.ip);
            if (handler) {
              this.ip = handler.catchStart;
              this.stack.push(exception);
            } else {
              throw new Error(`Unhandled exception: ${exception}`);
            }
            break;
          }

          case OpCode.CATCH: {
            this.currentException = null;
            break;
          }

          case OpCode.HALT:
          case OpCode.EXIT:
            this.running = false;
            break;

          default:
            throw new Error(`Unknown opcode: 0x${op.toString(16)} at ip=${this.ip - 1}`);
        }
      } catch (error: any) {
        const handler = this.findExceptionHandler(this.ip);
        if (handler) {
          this.currentException = error;
          this.ip = handler.catchStart;
          this.stack.push(error);
        } else {
          throw error;
        }
      }
    }

    if (this.rl) this.rl.close();
    
    for (const socket of this.sockets.values()) {
      if (socket instanceof net.Server) socket.close();
      else if (socket instanceof net.Socket) socket.destroy();
    }
    
    return this.pop();
  }
}