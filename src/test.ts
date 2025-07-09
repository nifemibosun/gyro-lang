import { tokenize } from "./lexer.js";
import { Parser } from "./parser.js";

const source = 'fun main() { print("Hello, Gyro Hacker\n Happy Hacking");}';

const tokens = tokenize(source);
const parser = new Parser(tokens);

console.log("Parsed Tokens:", parser.parse());