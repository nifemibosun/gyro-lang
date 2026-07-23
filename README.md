# Gyro - Gyro programming language compiler (gyro_rs)

Gyro is a small compiler for the Gyro programming language, implemented in Rust.

This repository contains the gyro_rs compiler which parses Gyro source files (.gyro), performs semantic analysis, and uses LLVM (via Inkwell) to produce native object code which is linked with clang to produce executables.

Project metadata
- Name: gyro_rs
- Description: Gyro programming language compiler written in Rust
- License: MIT
- Repository: https://github.com/nifemibosun/gyro-lang

Features
- Scanner, parser, and semantic analysis for the Gyro language
- Code generation using Inkwell (LLVM)
- Emits object code and links with clang to produce native executables
- Small standard library in `stdlib/` and an example in `examples/` (hello.gyro)

Prerequisites
- Rust and Cargo (stable toolchain) installed: https://www.rust-lang.org/tools/install
- LLVM (libllvm) v22 available for Inkwell (the project uses the `llvm22-1` Inkwell feature)
  - On many systems this can be provided by installing an LLVM 22 package
  - See Inkwell documentation for platform-specific instructions: https://github.com/TheDan64/inkwell
- clang available on PATH (used as the linker to produce the final executable)
  - Ensure `clang --version` works in your shell

Quick start (development)
1. Clone the repository

   git clone https://github.com/nifemibosun/gyro-lang.git
   cd gyro-lang

2. Build the compiler

   cargo build

3. Run the compiler binary (development mode)

   # Show help / usage
   cargo run -- --help

Usage examples

- Compile a Gyro source file to a native executable

  cargo run -- comp examples/hello.gyro

  This will produce an executable named `examples/hello` (on Windows `examples\hello.exe`) by compiling the generated object code with clang.

- Run a Gyro source file (compiles and exits)

  cargo run -- run examples/hello.gyro

Example `examples/hello.gyro`

import "std/io";

func main() {
    io.println("Hello, World");
}

Notes and environment variables
- The compiler relies on clang for linking. If clang is not found or linking fails, ensure clang is installed and on your PATH.

Troubleshooting
- "Linker 'clang' not found on PATH": install clang or add it to your PATH.
- Inkwell / LLVM build errors: confirm that the LLVM development files for the version configured (llvm22) are installed and accessible. Consult the Inkwell docs for platform-specific configuration.

Project layout
- Cargo.toml - Rust crate configuration and dependencies
- src/ - compiler source code (scanner, parser, semantic analyzer, codegen)
- stdlib/ - small standard library sources for Gyro
- examples/ - example Gyro programs (e.g., hello.gyro)
- LICENSE - MIT license
- README.md - README file

Contributing
Contributions are welcome! A few guidelines:
- Open an issue to discuss larger changes before implementing them
- Use small, focused pull requests
- Add tests or examples when introducing new features

License
This project is licensed under the MIT License - see LICENSE for details.

Maintainer
- nifemibosun <nifemibosun70@gmail.com>
