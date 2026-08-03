pub mod decl;
pub mod expr;
pub mod stdlib_src;
pub mod stmt;
pub mod types;

use std::collections::HashMap;
use std::io::Write;

use inkwell::OptimizationLevel;
use inkwell::builder::Builder;
use inkwell::context::Context;
use inkwell::module::Module;
use inkwell::targets::{
    CodeModel, FileType, InitializationConfig, RelocMode, Target, TargetMachine,
};
use inkwell::types::BasicTypeEnum;
use inkwell::values::PointerValue;

use crate::parser::ast;


const RUNTIME_RS_SRC: &str = include_str!("../../runtime/runtime.rs");
const ENTRY_RS_SRC: &str = include_str!("../../runtime/entry.rs");

pub struct Codegen<'ctx> {
    pub context: &'ctx Context,
    pub module: Module<'ctx>,
    pub builder: Builder<'ctx>,
    pub locals: HashMap<String, (PointerValue<'ctx>, BasicTypeEnum<'ctx>)>,
}

impl<'ctx> Codegen<'ctx> {
    pub fn new(context: &'ctx Context) -> Self {
        let module = context.create_module("gyro");
        let builder = context.create_builder();

        let fltused = module.add_global(context.i32_type(), None, "_fltused");
        fltused.set_initializer(&context.i32_type().const_int(1, false));

        let codegen = Codegen {
            context,
            module,
            builder,
            locals: HashMap::new(),
        };

        codegen
    }

    pub fn generate(
        &mut self,
        program: &ast::Program,
        imported_modules: &HashMap<String, ast::Program>,
        monomorphized: &[ast::FuncDecl],
        monomorphized_externs: &Vec<(String, Vec<(String, ast::TypeExpr)>, Option<ast::TypeExpr>)>,
    ) {
        for (name, params, ret) in monomorphized_externs {
            self.emit_extern_func(name, params, ret);
        }

        for (namespace, module_program) in imported_modules {
            for node in module_program {
                self.emit_decl_with_namespace(&node.value, Some(namespace));
            }
        }

        for func in monomorphized {
            self.emit_func(func, None);
        }

        for node in program {
            self.emit_decl_with_namespace(&node.value, None);
        }
    }
}

pub fn compile(program: &ast::Program, imported_modules: &HashMap<String, ast::Program>, monomorphized: &Vec<ast::FuncDecl>, monomorphized_externs: &Vec<(String, Vec<(String, ast::TypeExpr)>, Option<ast::TypeExpr>)>, out_path: &str) {
    Target::initialize_native(&InitializationConfig::default())
        .expect("Failed to initialize native target");

    let context = Context::create();
    let mut codegen = Codegen::new(&context);
    codegen.generate(program, imported_modules, monomorphized, monomorphized_externs);

    let triple = TargetMachine::get_default_triple();
    let target = Target::from_triple(&triple).unwrap();
    let machine = target
        .create_target_machine(
            &triple,
            "generic",
            "",
            OptimizationLevel::Aggressive,
            RelocMode::Default,
            CodeModel::Default,
        )
        .expect("Failed to create target machine");

    let buffer = machine
        .write_to_memory_buffer(&codegen.module, FileType::Object)
        .expect("Failed to write object buffer");

    if std::process::Command::new("clang")
        .arg("--version")
        .output()
        .is_err()
    {
        eprintln!("Linker 'clang' not found on PATH");
        std::process::exit(1);
    }

    let exe_path = out_path.strip_suffix(".gyro").unwrap_or(out_path);

    let obj_path = std::env::temp_dir().join("gyro_temp.o");
    std::fs::write(&obj_path, buffer.as_slice()).expect("Failed to write object temp");

    let combined_source = format!("{}\n{}", RUNTIME_RS_SRC, ENTRY_RS_SRC);
    let runtime_rs_path = std::env::temp_dir().join("gyro_runtime.rs");
    std::fs::write(&runtime_rs_path, &combined_source).expect("Failed to write runtime source temp");

    if std::process::Command::new("rustc").arg("--version").output().is_err() {
        eprintln!("'rustc' not found on PATH — needed to build and link the Gyro program");
        std::process::exit(1);
    }
    
    let link_arg = format!("-Clink-arg={}", obj_path.display());

    let status = std::process::Command::new("rustc")
        .arg("--edition").arg("2024")
        .arg("--crate-type").arg("bin")
        .arg("-O")
        .arg(&link_arg)
        .arg(&runtime_rs_path)
        .arg("-o").arg(exe_path)
        .status()
        .expect("Failed to run rustc");

    std::fs::remove_file(&obj_path).ok();
    std::fs::remove_file(&runtime_rs_path).ok();

    if !status.success() {
        eprintln!("Compilation/linking failed");
        std::io::stdout().flush().unwrap();
        std::process::exit(1);
    }

    std::io::stdout().flush().unwrap();
    std::process::exit(0);
}
