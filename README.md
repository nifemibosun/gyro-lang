# Gyro Language

A small, statically-typed programming language with a custom bytecode virtual machine, written in TypeScript. Gyro compiles to bytecode and executes on a stack-based VM, supporting functional programming, object-oriented features, and a module system.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Static Type System** - int, float, string, bool, and null
- **Modern Syntax** - Variables, functions, classes, control flow structures
- **Recursion** - Full support for recursive functions
- **Exception Handling** - try/catch/finally with throw statements
- **Bytecode VM** - Stack-based virtual machine for efficient execution
- **Type Inference** - Compile-time type checking and validation
- **CLI Tools** - Compile, execute, and debug Gyro programs

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/nifemibosun/gyro-lang.git
cd gyro-lang

# Install dependencies
npm install

# Build the project
npm run build
```

### Your First Program

Create a file called `hello.gyro`:

```gyro
fun main(): int {
    println("Hello, Gyro!");
    return 0;
}
```

Run it:

```bash
gyro run hello.gyro
```

## Language Guide

### Variables

```gyro
let x: int = 42;
let y = 42; // y type is inferred as int
let name: string = "Gyro";
let pi: float = 3.14;
let active: bool = true;
let nothing: null = null;
```

### Functions

```gyro
fun add(a: int, b: int): int {
    return a + b;
}

// Recursive function
fun fibonacci(n: int): int {
    if (n <= 1) {
        return n;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}
```

## CLI Commands

### Compile and Run

```bash
gyro run <file.gyro>
```

Compiles and executes a Gyro program in one step.

### Compile to Bytecode

```bash
# specified output path
gyro comp <file.gyro> -o <output.gbc>

# unspecified output path
gyro comp <file.gyro>
```

Compiles a Gyro program to bytecode.

### Run Bytecode

```bash
gyro run <file.gbc>
```

Executes a previously compiled bytecode file.

## Examples

The `examples/` directory contains several programs demonstrating Gyro features

Run any example:

```bash
gyro run examples/hello.gyro
```


## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
---
