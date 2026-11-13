import Scanner from "./scanner/scanner.js"
import { Position } from "./scanner/tokens.js"

export class GyroError {

    static new(pos: Position, msg: string) {
        console.dir(`Error[line:${pos.line} column:${pos.column}]: ${msg}`)
    }
}


const scanner = new Scanner('let name = "John Doe";');

console.log(scanner.tokenize());