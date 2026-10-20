import fs from 'fs';
import path from 'path';

import { compile, type CompilationResult } from './codegen.js';
import { GyroVM, type GyroVMOptions } from './vm.js';

export type GyroRunOptions = GyroVMOptions;

/**
 * Public embed API for the Gyro compiler and VM.
 *
 * `run` accepts source text, while `runFile` accepts a filesystem path.
 * `compile` accepts source text, while `compileFile` accepts a filesystem path.
 */
export default class Gyro {
    /** Compile Gyro source text into a complete serializable bytecode artifact. */
    static compile(source: string): CompilationResult {
        if (typeof source !== 'string') {
            throw new TypeError('Gyro.compile expects source code as a string, not a filename. Use compileFile() for paths.');
        }
        const candidatePath = source.trim();
        if (!candidatePath.includes('\n') && candidatePath.endsWith('.gyro') && fs.existsSync(path.resolve(candidatePath))) {
            throw new TypeError('Gyro.compile expects source code as a string, not a filename. Use compileFile() for paths.');
        }
        return compile(source);
    }

    /** Compile and execute Gyro source text. */
    static async run(source: string, options: GyroRunOptions = {}): Promise<unknown> {
        const compiled = this.compile(source);
        const vm = new GyroVM(compiled, options);
        return this.normalizeResult(compiled, await vm.run());
    }

    /** Execute a previously compiled artifact (including its constant pool and metadata). */
    static async exec(compiled: CompilationResult, options: GyroRunOptions = {}): Promise<unknown> {
        this.validateArtifact(compiled);
        const vm = new GyroVM(compiled, options);
        return this.normalizeResult(compiled, await vm.run());
    }

    /** Read, compile, and execute a `.gyro` file. Paths are resolved from the current working directory. */
    static async runFile(filePath: string, options: GyroRunOptions = {}): Promise<unknown> {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Gyro source file not found: ${absolutePath}`);
        }
        const source = fs.readFileSync(absolutePath, 'utf8');
        return this.run(source, options);
    }

    /** Read a `.gyro` file and return its compilation artifact without executing it. */
    static compileFile(filePath: string): CompilationResult {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Gyro source file not found: ${absolutePath}`);
        }
        return this.compile(fs.readFileSync(absolutePath, 'utf8'));
    }

    /** Compile source text and write the complete artifact as JSON. */
    static compileToFile(source: string, outFilePath: string): void {
        const absolutePath = path.resolve(outFilePath);
        const compiled = this.compile(source);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, JSON.stringify(compiled, null, 2), 'utf8');
    }

    /** Compile a source file to a JSON bytecode artifact. */
    static compileFileToFile(filePath: string, outFilePath: string): CompilationResult {
        const compiled = this.compileFile(filePath);
        const absolutePath = path.resolve(outFilePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, JSON.stringify(compiled, null, 2), 'utf8');
        return compiled;
    }

    /** Load and execute a complete JSON bytecode artifact produced by compileToFile(). */
    static async runBytecodeFile(filePath: string, options: GyroRunOptions = {}): Promise<unknown> {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath)) {
            throw new Error(`Gyro bytecode file not found: ${absolutePath}`);
        }

        let parsed: unknown;
        try {
            parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
        } catch (error) {
            throw new Error(`Invalid Gyro bytecode JSON: ${(error as Error).message}`);
        }

        this.validateArtifact(parsed as CompilationResult);
        return this.exec(parsed as CompilationResult, options);
    }

    private static normalizeResult(compiled: CompilationResult, result: unknown): unknown {
        const main = compiled.functions?.find((fn: any) => fn?.name === 'main');
        return main?.returnType === 'void' && result === null ? undefined : result;
    }

    private static validateArtifact(value: CompilationResult): void {
        if (!value || typeof value !== 'object' || !Array.isArray(value.bytecode)) {
            throw new TypeError('Invalid Gyro artifact: expected a bytecode array.');
        }
        if (!Array.isArray(value.constantPool)) {
            throw new TypeError('Invalid Gyro artifact: expected a constantPool array. Recompile the source with the current compiler.');
        }
        if (value.classes !== undefined && !Array.isArray(value.classes)) {
            throw new TypeError('Invalid Gyro artifact: classes must be an array when present.');
        }
        if (value.exceptionHandlers !== undefined && !Array.isArray(value.exceptionHandlers)) {
            throw new TypeError('Invalid Gyro artifact: exceptionHandlers must be an array when present.');
        }
    }
}

export { GyroVM } from './vm.js';
export type { GyroVMOptions } from './vm.js';
export { compile } from './codegen.js';
export type { CompilationResult } from './codegen.js';
