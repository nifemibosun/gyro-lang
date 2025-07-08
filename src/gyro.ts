// gyro.ts
import fs from 'fs';
import { Compiler } from './compiler.js';
import { GyroVM } from './vm.js';

export class Gyro {
  /**
   * Compiles and runs Gyro source code.
   * @param source The Gyro source code string.
   * @returns The value left on the stack after execution, or undefined.
   */
  static async run(source: string): Promise<any> {
    const { bytecode, constantPool } = Compiler.compile(source); // Compiler must return this structure
    const vm = new GyroVM(bytecode, constantPool);
    return await vm.run();
  }

  /**
   * Compiles Gyro source code to bytecode and its constant pool.
   * @param source The Gyro source code string.
   * @returns An object containing the bytecode (number[]) and constantPool (any[]).
   */
  static compile(source: string): { bytecode: number[]; constantPool: any[]; } {
    return Compiler.compile(source); // Assume compiler returns this
  }

  /**
   * Reads a Gyro source file, compiles, and runs it.
   * @param filePath The path to the .gyro source file.
   * @returns The value left on the stack after execution, or undefined.
   */
  static async runFile(filePath: string): Promise<any> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const source = fs.readFileSync(filePath, 'utf-8');
    return await this.run(source);
  }

  /**
   * Compiles Gyro source code to a .gbc file.
   * The .gbc file will be a JSON string containing an object with 'bytecode' and 'constantPool' arrays.
   * @param source The Gyro source code string.
   * @param outFilePath The path where the .gbc file should be written.
   */
  static compileToFile(source: string, outFilePath: string) {
    const { bytecode, constantPool } = Compiler.compile(source);
    fs.writeFileSync(outFilePath, JSON.stringify({ bytecode, constantPool }, null, 2));
  }

  /**
   * Reads a .gbc bytecode file and runs it.
   * @param filePath The path to the .gbc bytecode file.
   * @returns The value left on the stack after execution, or undefined.
   */
  static async runBytecodeFile(filePath: string): Promise<any> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Bytecode file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const { bytecode, constantPool } = JSON.parse(content); // Expecting object with bytecode and constantPool
    if (!Array.isArray(bytecode) || !Array.isArray(constantPool)) {
        throw new Error(`Invalid GBC file format: Expected 'bytecode' and 'constantPool' arrays.`);
    }
    const vm = new GyroVM(bytecode, constantPool);
    return await vm.run();
  }
}












// import fs from 'fs';
// import { Compiler } from './compiler.js';
// import { GyroVM } from './vm.js';

// export class Gyro {
//   static run(source: string) {
//     const bytecode = Compiler.compile(source);
//     const vm = new GyroVM(bytecode);
//     vm.run();
//   }

//   static compile(source: string): number[] {
//     return Compiler.compile(source);
//   }

//   static runFile(filePath: string) {
//     if (!fs.existsSync(filePath)) {
//       throw new Error(`File not found: ${filePath}`);
//     }
//     const source = fs.readFileSync(filePath, 'utf-8');
//     this.run(source);
//   }

//   static compileToFile(source: string, outFilePath: string) {
//     const bytecode = Compiler.compile(source);
//     fs.writeFileSync(outFilePath, JSON.stringify(bytecode));
//   }

//   static runBytecodeFile(filePath: string) {
//     if (!fs.existsSync(filePath)) {
//       throw new Error(`Bytecode file not found: ${filePath}`);
//     }
//     const content = fs.readFileSync(filePath, 'utf-8');
//     const bytecode = JSON.parse(content);
//     const vm = new GyroVM(bytecode);
//     vm.run();
//   }
// }
