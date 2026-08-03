use inkwell::types::{ BasicMetadataTypeEnum, BasicType };

use crate::parser::ast;
use crate::semantic::symbol_table::Type;
use crate::utils::convert_type_expr;

use super::Codegen;

impl<'ctx> Codegen<'ctx> {
    pub fn emit_decl(&mut self, decl: &ast::Decl) {
        self.emit_decl_with_namespace(decl, None);
    }

    pub fn emit_decl_with_namespace(&mut self, decl: &ast::Decl, namespace: Option<&str>) {
        match decl {
            ast::Decl::Func(func) => {
                if func.generics.is_empty() {
                    self.emit_func(func, namespace);
                }
            }
            ast::Decl::ExternFunc { name, generics, params, return_type, .. } => {
                if generics.is_empty() {
                    self.emit_extern_func(name, params, return_type);
                }
            }
            ast::Decl::Struct { name, fields, .. } => {
                self.emit_struct(name, fields)
            }
            ast::Decl::ConstDecl { .. } => {
                eprintln!("Warning: global const not yet implemented, skipping");
            }
            ast::Decl::Import { .. } => {}
            ast::Decl::Enum { .. } => {
                eprintln!("Warning: enums not yet implemented, skipping");
            }
            ast::Decl::Construct { .. } => {
                eprintln!("Warning: construct blocks not yet implemented, skipping");
            }
            ast::Decl::Type { .. } => {
                eprintln!("Warning: type aliases not yet implemented, skipping");
            }
        }
    }

    fn mangled_name(namespace: Option<&str>, name: &str) -> String {
        match namespace {
            Some(ns) => format!("{}_{}", ns, name),
            None => name.to_string(),
        }
    }

    pub fn emit_func(&mut self, func: &ast::FuncDecl, namespace: Option<&str>) {
        let param_types: Vec<BasicMetadataTypeEnum> = func
            .params
            .iter()
            .map(|(_, type_expr)| {
                let ty = convert_type_expr(type_expr);
                self.llvm_type(&ty).into()
            })
            .collect();

        let fn_type = match &func.return_type {
            Some(ret_expr) => {
                let ret_ty = convert_type_expr(ret_expr);
                match ret_ty {
                    Type::Unit => self.context.void_type().fn_type(&param_types, false),
                    other => self.llvm_type(&other).fn_type(&param_types, false),
                }
            }
            None => self.context.void_type().fn_type(&param_types, false),
        };

        let llvm_name = if namespace.is_none() && func.name == "main" {
            "gyro_main".to_string()
        } else {
            Self::mangled_name(namespace, &func.name)
        };
        
        let function = self.module.add_function(&llvm_name, fn_type, None);

        let entry_block = self.context.append_basic_block(function, "entry");
        self.builder.position_at_end(entry_block);

        self.locals.clear();
        for (i, (param_name, param_type_expr)) in func.params.iter().enumerate() {
            let ty = convert_type_expr(param_type_expr);
            let llvm_ty = self.llvm_type(&ty);

            let slot = self.builder.build_alloca(llvm_ty, param_name).unwrap();
            let param_val = function.get_nth_param(i as u32).unwrap();

            self.builder.build_store(slot, param_val).unwrap();

            self.locals.insert(param_name.clone(), (slot, llvm_ty));
        }

        for stmt in &func.body {
            self.emit_stmt(stmt);
        }

        let last_block = self.builder.get_insert_block().unwrap();
        if last_block.get_terminator().is_none() {
            match &func.return_type {
                None => { self.builder.build_return(None).unwrap(); }
                Some(ret_expr) => {
                    let ret_ty = convert_type_expr(ret_expr);
                    if ret_ty == Type::Unit {
                        self.builder.build_return(None).unwrap();
                    }
                }
            }
        }
    }

    pub fn emit_extern_func(
        &mut self,
        name: &str,
        params: &[(String, ast::TypeExpr)],
        return_type: &Option<ast::TypeExpr>,
    ) {
        if self.module.get_function(name).is_some() {
            return;
        }

        let param_types: Vec<BasicMetadataTypeEnum> = params
            .iter()
            .map(|(_, type_expr)| {
                let ty = convert_type_expr(type_expr);
                self.llvm_type(&ty).into()
            })
            .collect();

        let fn_type = match return_type {
            Some(ret_expr) => {
                let ret_ty = convert_type_expr(ret_expr);
                match ret_ty {
                    Type::Unit => self.context.void_type().fn_type(&param_types, false),
                    other => self.llvm_type(&other).fn_type(&param_types, false),
                }
            }
            None => self.context.void_type().fn_type(&param_types, false),
        };

        self.module.add_function(name, fn_type, None);
    }

    fn emit_struct(&mut self, name: &str, fields: &[(String, ast::TypeExpr)]) {
        let field_types: Vec<_> = fields
            .iter()
            .map(|(_, type_expr)| {
                let ty = convert_type_expr(type_expr);
                self.llvm_type(&ty)
            })
            .collect();

        let struct_type = self.context.opaque_struct_type(name);
        struct_type.set_body(&field_types, false);
    }
}