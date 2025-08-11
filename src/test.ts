import { compile } from './codegen.js';

const source = `
print("Bosun");
`;

const gbc = compile(source);
console.log(gbc);