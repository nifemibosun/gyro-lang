#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { Compiler } from './compiler.js';
import { GyroVM } from './vm.js';


function printHelp() {
  console.log(`
Usage: gyro <command> <file>

Commands:
  run <file>     Compile and run a .gyro source file
  build <file>   Compile a .gyro file to a .gbc file
  repl           Start interactive REPL
  --help         Show this help message
  --version      Show Gyro version
`);
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        printHelp();
        return;
    }

    if (args[0] === '--version') {
        console.log('Gyro v0.1.0');
        return;
    }

    const command = args[0];


    if (command === 'run') {
        let filename = args[1];

        if (!filename) {
            try {
                const config = JSON.parse(fs.readFileSync('gyro.config.json', 'utf-8'));
                filename = config.entry;
            } catch {
                console.error('No file provided and gyro.config.json not found.');
                return;
            }
        }

        if (!fs.existsSync(filename)) {
            console.error(`File not found: ${filename}`);
            return;
        }

        if (filename.endsWith('.gbc')) {
            const content = fs.readFileSync(filename, 'utf-8');
            const { bytecode, constantPool } = JSON.parse(content);
            const vm = new GyroVM(bytecode, constantPool);
            await vm.run();
        } else {
            const source = fs.readFileSync(filename, 'utf-8');
            const { bytecode, constantPool } = Compiler.compile(source);
            const vm = new GyroVM(bytecode, constantPool);
            await vm.run();
        }
    } else if (command === 'build') {
        let filename = args[1];

        if (!filename) {
            try {
                const config = JSON.parse(fs.readFileSync('gyro.config.json', 'utf-8'));
                filename = config.entry;
            } catch {
                console.error('No file provided and gyro.config.json not found.');
                return;
            }
        }

        if (!fs.existsSync(filename)) {
            console.error('File not found.');
            return;
        }

        const source = fs.readFileSync(filename, 'utf-8');
        const bytecode = Compiler.compile(source);

        let outPath = filename.replace(/\.gyro$/, '.gbc');
        try {
            const config = JSON.parse(fs.readFileSync('gyro.config.json', 'utf-8'));
            const baseName = path.basename(filename, '.gyro');
            const outDir = config.outDir || '.';
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            outPath = path.join(outDir, `${baseName}.gbc`);
        } catch {
        }

        fs.writeFileSync(outPath, JSON.stringify(bytecode));
        console.log(`Compiled to ${outPath}`);
  } else if (command === 'init') {
        const cwd = process.cwd();
        const srcDir = path.join(cwd, 'src');
        const configPath = path.join(cwd, 'gyro.config.json');

        if (!fs.existsSync(srcDir)) {
            fs.mkdirSync(srcDir);
        }

        const mainFile = path.join(srcDir, 'main.gyro');
        if (!fs.existsSync(mainFile)) {
            fs.writeFileSync(mainFile, `fun main() {\n    print("Hello, Gyro Hacker");\n}\n\nmain();\n`);
        }

        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(
                configPath,
                JSON.stringify({
                entry: 'src/main.gyro',
                outDir: 'dist',
                target: 'esgyro',
                version: '0.1.0'
                }, null, 2)
            );
        }

        const gitignore = path.join(cwd, '.gitignore');
        if (!fs.existsSync(gitignore)) {
            fs.writeFileSync(gitignore, `node_modules/\ndist/\n*.gbc\n`);
        }

        console.log('New Gyro project initialized!');
  } else if (command === 'repl') {
        console.log('Gyro REPL — type "exit" to quit\n');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: '>> '
        });

        rl.prompt();

        rl.on('line', (line) => {
            if (line.trim().toLowerCase() === 'exit') {
                rl.close();
                return;
            }

            if (line.trim() === 'clear') {
                console.clear();
                rl.prompt();
                return;
            }

            if (line.trim() === ':help') {
                console.log(`Available:
            - exit       Quit REPL
            - clear      Clear screen
            - :help      Show this message`);
                rl.prompt();
                return;
            }

            try {
                const { bytecode, constantPool } = Compiler.compile(line);
                const vm = new GyroVM(bytecode, constantPool);
                vm.run();
            } catch (err) {
                console.error('Error:', (err as Error).message);
            }

            rl.prompt();
        });

        rl.on('close', () => {
            console.log('\nGoodbye.');
        });

  } else {
        console.error(`Unknown command: ${command}`);
        printHelp();
  }
}

main();
