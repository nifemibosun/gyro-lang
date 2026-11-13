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
```