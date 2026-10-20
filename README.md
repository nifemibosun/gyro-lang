# Gyro (TypeScript VM)

Gyro is a statically annotated language that compiles source into a serializable bytecode artifact and executes it on a TypeScript/Node.js virtual machine. It can be used from the CLI or embedded in a Node.js application.

## Requirements

- Node.js 26 or newer for the complete build workflow, including the native Single Executable Application (SEA) build.
- npm

The TypeScript CLI/VM and the native SEA build have different requirements: this project's `npm run build` uses Node's native `--build-sea` command and intentionally does not use `postject`.

## Build and test

```sh
npm install
npm run build
npm test
```

Run the included examples:

```sh
node dist/cli.js run examples/hello.gyro
node dist/cli.js run examples/advanced.gyro
node dist/cli.js run examples/arrays.gyro
node dist/cli.js run examples/loops.gyro
```

## Language example

```gyro
import * as io from "std/io";
import * as math from "std/math";

fun main(): void {
    io.println(math.sqrt(81.0));
}
```

Functions use `fun name(parameters): returnType { ... }`. Variables use `let name: type = value;` or `let name = value;`. Statements end in semicolons except block statements.

## Embedding API

```ts
import Gyro from 'gyro';

const result = await Gyro.runFile('examples/hello.gyro', {
    output: value => console.log('[gyro]', value),
    maxSteps: 1_000_000,
});

const artifact = Gyro.compile('fun main(): void { println("hello"); }');
await Gyro.exec(artifact);
```

- `Gyro.compile(source)` accepts **source text**, not a filename.
- `Gyro.compileFile(path)` reads and compiles a file.
- `Gyro.run(source, options)` compiles and executes source text.
- `Gyro.runFile(path, options)` reads, compiles, and executes a source file.
- `Gyro.exec(artifact, options)` executes a full compiled artifact.
- `Gyro.compileFileToFile(sourcePath, outputPath)` writes the complete artifact, including constants and metadata.
- `Gyro.runBytecodeFile(path, options)` executes that artifact.

The VM output callback makes it possible to capture Gyro output in tests, editors, or other applications. The `input` option can provide input without attaching a terminal. The VM also has a configurable instruction limit to stop infinite loops in embedded contexts.

## Standard library

Current virtual standard modules are documented in [`stdlib/README.md`](stdlib/README.md). Built-ins are provided by the VM, so these imports do not depend on physical paths under `node_modules`.

## Known limitations

This is still an early-stage language implementation. Custom file-based module linking, full exception/finally semantics, and some networking/pointer opcodes are not complete. The CLI's `repl` still expects complete program snippets with a `main` function rather than arbitrary expression evaluation. Unsupported native operations report explicit errors when executed.

## Build a standalone executable without `postject`

The build script bundles the CLI with esbuild and uses Node's native `--build-sea` command to create `gyro.exe` directly. It does not use `postject` or another external blob-injection utility.

```bat
node --version
npm install
npm run build
```

Use Node.js 26 or newer for this workflow. After building, test the executable manually:

```bat
.\gyro.exe --version
.\gyro.exe run examples\hello.gyro
```

The executable contains the Gyro CLI and embedded Node runtime. It can execute `.gyro` files supplied to it; those source files are read from disk relative to the current working directory.
