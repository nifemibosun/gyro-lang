#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';

import { compile } from './codegen.js';
import { GyroVM } from './vm.js';

const GYRO_VERSION = '2.0.0';

function printHelp() {
  console.log(`
GYRO Programming Language CLI v${GYRO_VERSION}

Usage: gyro <command> [options] <file>

Commands:
  run <file>         Compile and run a .gyro source file
  compile <file>     Compile a .gyro file to a .gbc file
  exec <file>        Execute a .gbc bytecode file directly
  init [name]        Initialize a new Gyro project
  repl               Start interactive REPL
  debug <file>       Run with debug information
  validate <file>    Validate GBC file format
  info <file>        Show GBC file information
  --help | -h        Show this help message
  --version | -v     Show Gyro version

Options:
  --output, -o       Specify output file (compile command)
  --verbose, -V      Enable verbose output
  --optimize, -O     Enable optimizations (if available)
  --target           Target VM version (1.0, 2.0)

Examples:
  gyro run app.gyro
  gyro compile -o dist/app.gbc src/main.gyro
  gyro init my-project
  gyro debug --verbose app.gyro
`);
}

function parseArgs(args: string[]) {
  const parsed = {
    command: '',
    file: '',
    options: {} as Record<string, any>
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed.options[key] = args[++i];
      } else {
        parsed.options[key] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        parsed.options[key] = args[++i];
      } else {
        parsed.options[key] = true;
      }
    } else if (!parsed.command) {
      parsed.command = arg;
    } else if (!parsed.file) {
      parsed.file = arg;
    }
    i++;
  }

  return parsed;
}

function validateGBC(gbc: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!gbc.bytecode || !Array.isArray(gbc.bytecode)) {
    errors.push('Missing or invalid bytecode array');
  }

  if (!gbc.constantPool || !Array.isArray(gbc.constantPool)) {
    errors.push('Missing or invalid constantPool array');
  }

  if (gbc.metadata) {
    if (gbc.metadata.version && typeof gbc.metadata.version !== 'string') {
      errors.push('Invalid metadata version');
    }
  }

  if (gbc.classes) {
    if (!Array.isArray(gbc.classes)) {
      errors.push('Classes must be an array');
    } else {
      gbc.classes.forEach((cls: any, i: number) => {
        if (!cls.name || typeof cls.name !== 'string') {
          errors.push(`Class ${i}: missing or invalid name`);
        }
        if (cls.fields && !Array.isArray(cls.fields)) {
          errors.push(`Class ${i}: fields must be an array`);
        }
        if (cls.methods && !Array.isArray(cls.methods)) {
          errors.push(`Class ${i}: methods must be an array`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function showGBCInfo(gbc: any, filename: string) {
  console.log(`\nGBC File Information: ${filename}`);
  console.log('─'.repeat(50));
  
  if (gbc.metadata) {
    console.log(`Version: ${gbc.metadata.version || 'Unknown'}`);
    console.log(`Target: ${gbc.metadata.target || 'Unknown'}`);
    console.log(`Memory Model: ${gbc.metadata.memoryModel || 'Unknown'}`);
    if (gbc.metadata.createdBy) console.log(`Created By: ${gbc.metadata.createdBy}`);
  }

  console.log(`Bytecode Instructions: ${gbc.bytecode?.length || 0}`);
  console.log(`Constants: ${gbc.constantPool?.length || 0}`);
  console.log(`Classes: ${gbc.classes?.length || 0}`);
  console.log(`Functions: ${gbc.functions?.length || 0}`);
  console.log(`Exception Handlers: ${gbc.exceptionHandlers?.length || 0}`);

  if (gbc.classes?.length > 0) {
    console.log('\nClasses:');
    gbc.classes.forEach((cls: any) => {
      console.log(`  • ${cls.name} (${cls.fields?.length || 0} fields, ${cls.methods?.length || 0} methods)`);
    });
  }

  if (gbc.functions?.length > 0) {
    console.log('\n⚡ Functions:');
    gbc.functions.forEach((fn: any) => {
      console.log(`  • ${fn.name}(${fn.params?.join(', ') || ''}) -> ${fn.returnType || 'void'}`);
    });
  }
}

async function runWithDebug(source: string, options: any) {
  if (options.verbose) {
    console.log('🔧 Compiling source code...');
  }
  
  const compiled = compile(source);
  
  if (options.verbose) {
    console.log(`Compilation complete!`);
    console.log(`   Bytecode size: ${compiled.bytecode?.length || 0} instructions`);
    console.log(`   Constants: ${compiled.constantPool?.length || 0}`);
    console.log('   Starting VM execution...\n');
  }
  
  const vm = new GyroVM(compiled);
  const result = await vm.run();
  
  if (options.verbose) {
    console.log(`\n✨ Execution complete. Result: ${result}`);
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`GYRO v${GYRO_VERSION}`);
    console.log('Enhanced VM with OOP, Networking, and Memory Management');
    return;
  }

  const parsed = parseArgs(args);
  const { command, file, options } = parsed;

  try {
    switch (command) {
      case 'run': {
        let filename = file;

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
          const gbc = JSON.parse(content);
          
          const validation = validateGBC(gbc);
          if (!validation.valid) {
            console.error('Invalid GBC file:');
            validation.errors.forEach(err => console.error(`   ${err}`));
            return;
          }
          
          const vm = new GyroVM(gbc);
          await vm.run();
        } else {
          const source = fs.readFileSync(filename, 'utf-8');
          if (options.debug || options.verbose) {
            await runWithDebug(source, options);
          } else {
            const compiled = compile(source);
            const vm = new GyroVM(compiled);
            await vm.run();
          }
        }
        break;
      }

      case 'comp': {
        let filename = file;

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

        const source = fs.readFileSync(filename, 'utf-8');
        let compiled;
        
        try {
          compiled = compile(source);
        } catch (err) {
          console.error('Compilation failed:', (err as Error).message);
          return;
        }

        const enhancedGBC = {
          metadata: {
            version: '0.2.0',
            target: 'gyro-vm',
            memoryModel: options.target === '1.0' ? 'stack-only' : 'enhanced',
            createdBy: 'gyro-compiler-ts',
            timestamp: new Date().toISOString(),
            sourceFile: filename
          },
          ...compiled
        };

        let outPath = options.output || options.o || filename.replace(/\.gyro$/, '.gbc');
        
        try {
          const config = JSON.parse(fs.readFileSync('gyro.config.json', 'utf-8'));
          if (!options.output && !options.o) {
            const baseName = path.basename(filename, '.gyro');
            const outDir = config.outDir || '.';
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
            outPath = path.join(outDir, `${baseName}.gbc`);
          }
        } catch {
        }

        fs.writeFileSync(outPath, JSON.stringify(enhancedGBC, null, 2));
        console.log(`Compiled to ${outPath}`);
        
        if (options.verbose) {
          showGBCInfo(enhancedGBC, outPath);
        }
        break;
      }

      case 'exec': {
        if (!file) {
          console.error('No GBC file specified');
          return;
        }

        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          return;
        }

        const content = fs.readFileSync(file, 'utf-8');
        const gbc = JSON.parse(content);
        
        const validation = validateGBC(gbc);
        if (!validation.valid) {
          console.error('Invalid GBC file:');
          validation.errors.forEach(err => console.error(`   ${err}`));
          return;
        }

        const vm = new GyroVM(gbc);
        await vm.run();
        break;
      }

      case 'debug': {
        if (!file) {
          console.error('No file specified');
          return;
        }

        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          return;
        }

        const source = fs.readFileSync(file, 'utf-8');
        await runWithDebug(source, { ...options, verbose: true });
        break;
      }

      case 'validate': {
        if (!file) {
          console.error('No GBC file specified');
          return;
        }

        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          return;
        }

        const content = fs.readFileSync(file, 'utf-8');
        let gbc;
        
        try {
          gbc = JSON.parse(content);
        } catch {
          console.error('Invalid JSON format');
          return;
        }

        const validation = validateGBC(gbc);
        if (validation.valid) {
          console.log(`${file} is a valid GBC file`);
          if (options.verbose) {
            showGBCInfo(gbc, file);
          }
        } else {
          console.error(`${file} is invalid:`);
          validation.errors.forEach(err => console.error(`   ${err}`));
        }
        break;
      }

      case 'info': {
        if (!file) {
          console.error('No GBC file specified');
          return;
        }

        if (!fs.existsSync(file)) {
          console.error(`File not found: ${file}`);
          return;
        }

        const content = fs.readFileSync(file, 'utf-8');
        const gbc = JSON.parse(content);
        showGBCInfo(gbc, file);
        break;
      }

      case 'init': {
        const projectName = file || 'gyro-project';
        const projectDir = path.join(process.cwd(), projectName);
        const srcDir = path.join(projectDir, 'src');
        const configPath = path.join(projectDir, 'gyro.config.json');

        if (fs.existsSync(projectDir)) {
          console.error(`Directory ${projectName} already exists`);
          return;
        }

        fs.mkdirSync(projectDir);
        fs.mkdirSync(srcDir);

        const mainFile = path.join(srcDir, 'main.gyro');
        fs.writeFileSync(mainFile, `
fun main(): void {
    println("Hello, Gyro Hacker");
}

main();
        `);

        const config = {
          name: projectName,
          version: '0.1.0',
          entry: 'src/main.gyro',
          outDir: 'dist',
          target: 'gyro-vm',
        };

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        const gitignore = path.join(projectDir, '.gitignore');
        fs.writeFileSync(gitignore, `
node_modules/
dist/
*.gbc
.DS_Store
*.log
        `);

        const readme = path.join(projectDir, 'README.md');
        fs.writeFileSync(readme, `# ${projectName}

## Getting Started

\`\`\`bash
# Run the project
gyro run

# Compile to bytecode
gyro compile

# Run with debug info
gyro debug src/main.gyro
\`\`\`
`);

        console.log(`Created new GYRO project: ${projectName}`);
        console.log(`\nGet started:`);
        console.log(`   cd ${projectName}`);
        console.log(`   gyro run`);
        console.log(`   gyro comp`);
        break;
      }

      case 'repl': {
        console.log(`GYRO v${GYRO_VERSION} REPL`);
        console.log('Type "exit" to quit, ":help" for commands\n');
        
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
          prompt: '>> '
        });

        rl.prompt();

        rl.on('line', async (line) => {
          const trimmed = line.trim();
          
          if (trimmed.toLowerCase() === 'exit') {
            rl.close();
            return;
          }

          if (trimmed === 'clear') {
            console.clear();
            rl.prompt();
            return;
          }

          if (trimmed === ':help') {
            console.log(`Available commands:
  exit         Quit REPL
  clear        Clear screen
  :help        Show this message
  :version     Show GYRO version
  
Try some code:
  print("Hello World");
  let x = 5 + 3; print(x);`);
            rl.prompt();
            return;
          }

          if (trimmed === ':version') {
            console.log(`GYRO v${GYRO_VERSION} - Enhanced VM`);
            rl.prompt();
            return;
          }

          if (trimmed === '') {
            rl.prompt();
            return;
          }

          try {
            const compiled = compile(trimmed);
            const vm = new GyroVM(compiled);
            const result = await vm.run();
            if (result !== undefined) {
              console.log(`=> ${result}`);
            }
          } catch (err) {
            console.error('Error:', (err as Error).message);
          }

          rl.prompt();
        });

        rl.on('close', () => {
          console.log('\nGoodbye from GYRO!');
        });
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
    }
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    if (options.verbose) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

main();