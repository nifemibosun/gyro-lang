#![allow(unused, unused_imports)]

use std::env;
use std::fs;
use std::io::Result;
use std::process::exit;

use crate::codegen;
use crate::parser;
use crate::scanner;
use crate::semantic;

fn help_msg() {
    println!("Usage: gyro [Option?] [Command?] [filename?]\n");
    // Options
    println!("Options:");
    println!("  -h, --help               Shows this help message");
    println!("  -v, --version            Print version info and exit \n");
    // Commands
    println!("Commands:");
    println!("    comp      Compile the specified file");
    println!("    run       Run a binary or example of the local file \n");
}

fn help_args(args: Vec<String>, state: &mut State) {
    if args.len() > 4 {
        help_msg();
        exit(64);
    } else if args.len() == 2 {
        match args[1].as_str() {
            "--help" | "-h" => {
                help_msg();
                exit(0);
            }
            "--version" | "-v" => {
                println!("gyro v0.1.0");
                exit(0);
            }
            _ => {
                help_msg();
                exit(64);
            }
        }
    } else if args.len() == 3 {
        match args[1].as_str() {
            "comp" | "run" => {
                let filename = &args[2];
                if !filename.ends_with(".gyro") {
                    eprintln!("Error: file must end with `.gyro`");
                    exit(65);
                }

                if let Err(err) = run_file(state, filename) {
                    eprintln!("Error: {}", err);
                    exit(74);
                }
            }
            _ => {
                help_msg();
                exit(64);
            }
        }
    } else {
        help_msg();
        exit(64);
    }
}

#[derive(Debug, PartialEq, Eq, Clone)]
pub struct State {
    pub had_error: bool,
}

impl State {
    pub fn new() -> Self {
        State { had_error: false }
    }

    pub fn error(&mut self, pos: scanner::token::Position, message: &str) {
        self.report(pos, message);
    }

    fn report(&mut self, pos: scanner::token::Position, message: &str) {
        eprintln!("Error at {}:{}: {}", pos.line, pos.col, message);
        self.had_error = true;
    }
}

fn run_file(state: &mut State, path: &str) -> Result<()> {
    let content = fs::read_to_string(path)?;
    compile(state, &content, path);

    if state.had_error {
        exit(65);
    }

    Ok(())
}

fn compile(state: &mut State, source: &str, output_path: &str) {
    let entry_path = std::path::Path::new(output_path);
    let mut scanner = scanner::Scanner::new(source, state);
    let (tokens, _) = scanner.scan_tokens();
    let mut parser = parser::Parser::new(tokens);
    let ast = parser.parse().expect("syntax error ");
    let mut analyzer = semantic::SemanticAnalyzer::new(&ast)
        .with_base_dir(entry_path.parent().unwrap().to_path_buf())
        .with_import_chain(vec![
            entry_path
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .to_string(),
        ]);
        
    analyzer.analyze_program();
    let imported_modules = analyzer.imported_modules;
    let monomorphized = analyzer.monomorphized;
    let monomorphized_externs = analyzer.monomorphized_externs;
    let resolved_ast = analyzer.resolved_ast;

    codegen::compile(&resolved_ast, &imported_modules, &monomorphized, &monomorphized_externs, output_path);
}

pub fn run() {
    let args: Vec<String> = env::args().collect();

    if args.len() == 1 {
        help_msg();
        exit(64);
    }

    let mut state = State::new();
    help_args(args, &mut state);
}
