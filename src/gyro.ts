// gyro.ts
import fs from 'fs';
import { compile } from './compiler.js';
import { GyroVM } from './vm.js';

export class Gyro {
  static run(source: string) {
    const bytecode = compile(source);
    const vm = new GyroVM(bytecode);
    vm.run();
  }

  static compile(source: string): number[] {
    return compile(source);
  }

  static runFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }
    const source = fs.readFileSync(filePath, 'utf-8');
    this.run(source);
  }

  static compileToFile(source: string, outFilePath: string) {
    const bytecode = compile(source);
    fs.writeFileSync(outFilePath, JSON.stringify(bytecode));
  }

  static runBytecodeFile(filePath: string) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Bytecode file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const bytecode = JSON.parse(content);
    const vm = new GyroVM(bytecode);
    vm.run();
  }
}
