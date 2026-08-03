#![allow(unused)]

use std::collections::HashMap;
use std::path::{Path, PathBuf};

pub mod symbol_table;
use crate::parser::ast;
use crate::scanner::token;
use crate::utils::convert_type_expr;

#[derive(Debug, Clone)]
pub struct CurrFuncBlock {
    current_func_name: String,
    curr_ret_type: symbol_table::Type,
}

#[derive(Debug, Clone)]
pub struct SemanticAnalyzer<'a> {
    ast: &'a ast::Program,
    pub curr_func_block: Option<CurrFuncBlock>,
    pub symbols: symbol_table::SymbolTable,
    base_dir: PathBuf,
    import_chain: Vec<String>,
    pub imported_modules: HashMap<String, ast::Program>,
    generic_templates: HashMap<String, ast::FuncDecl>,
    generic_extern_templates: HashMap<String, (Vec<String>, Vec<(String, ast::TypeExpr)>, Option<ast::TypeExpr>)>,
    pub monomorphized: Vec<ast::FuncDecl>,
    pub monomorphized_externs: Vec<(String, Vec<(String, ast::TypeExpr)>, Option<ast::TypeExpr>)>,
    imported_envs: HashMap<String, (HashMap<String, symbol_table::Symbol>, HashMap<String, ast::FuncDecl>, HashMap<String, (Vec<String>, Vec<(String, ast::TypeExpr)>, Option<ast::TypeExpr>)>)>,
    pub resolved_ast: ast::Program,
}

impl<'a> SemanticAnalyzer<'a> {
    pub fn new(ast: &'a ast::Program) -> Self {
        SemanticAnalyzer {
            ast,
            curr_func_block: None,
            symbols: symbol_table::SymbolTable::new(),
            base_dir: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
            import_chain: Vec::new(),
            imported_modules: HashMap::new(),
            generic_templates: HashMap::new(),
            generic_extern_templates: HashMap::new(),
            monomorphized: Vec::new(),
            monomorphized_externs: Vec::new(),
            imported_envs: HashMap::new(),
            resolved_ast: Vec::new(),
        }
    }

    pub fn analyze_program(&mut self) -> symbol_table::SymbolTable {
        let mut resolved: ast::Program = Vec::new();

        for decl in self.ast.clone() {
            match self.analyze_decl(decl.value) {
                Ok(new_decl) => resolved.push(ast::Node::new(new_decl, decl.pos)),
                Err(e) => eprintln!("Semantic Error: {}", e),
            }
        }

        self.resolved_ast = resolved;
        std::mem::take(&mut self.symbols)
    }

    pub fn with_base_dir(mut self, dir: PathBuf) -> Self {
        self.base_dir = dir;
        self
    }

    pub fn with_import_chain(mut self, chain: Vec<String>) -> Self {
        self.import_chain = chain;
        self
    }

    fn analyze_expr(&mut self, expr: ast::Expr) -> Result<(ast::Expr, symbol_table::Type), String> {
        let pos = expr.pos.clone();
        match expr.value {
            ast::ExprKind::Literal(lit) => {
                let ty = match &lit {
                    token::LiteralTypes::Int(_) => symbol_table::Type::Int32,
                    token::LiteralTypes::Float(_) => symbol_table::Type::Float64,
                    token::LiteralTypes::String(_) => symbol_table::Type::String,
                    token::LiteralTypes::Bool(_) => symbol_table::Type::Bool,
                    token::LiteralTypes::Char(_) => symbol_table::Type::Char,
                    _ => return Err("Unknown literal type".to_string()),
                };
                Ok((ast::Node::new(ast::ExprKind::Literal(lit), pos), ty))
            }
            ast::ExprKind::Identifier(name) => {
                if let Some(symbol) = self.symbols.resolve(&name) {
                    match &symbol.kind {
                        symbol_table::SymbolKind::Variable { var_type, .. } => {
                            let ty = var_type.clone();
                            Ok((ast::Node::new(ast::ExprKind::Identifier(name), pos), ty))
                        }
                        _ => Err(format!("'{}' is not a variable", &name)),
                    }
                } else {
                    Err(format!("Undefined variable: {}", &name))
                }
            }
            ast::ExprKind::Unary { op, right } => {
                let (r_expr, r_ty) = self.analyze_expr(*right)?;
                let result_ty = match op {
                    token::TokenType::Minus => {
                        if r_ty.is_numeric() { r_ty.clone() } else {
                            return Err(format!("Cannot use '-' on type {:?}", r_ty));
                        }
                    }
                    token::TokenType::Bang => {
                        if r_ty == symbol_table::Type::Bool { symbol_table::Type::Bool } else {
                            return Err(format!("Cannot use '!' on type {:?}", r_ty));
                        }
                    }
                    _ => return Err(format!("Unknown unary operator {:?}", op)),
                };
                let node = ast::Node::new(ast::ExprKind::Unary { op, right: Box::new(r_expr) }, pos);
                Ok((node, result_ty))
            }
            ast::ExprKind::Binary { left, op, right } => {
                let (l_expr, l_ty) = self.analyze_expr(*left)?;
                let (r_expr, r_ty) = self.analyze_expr(*right)?;
                if l_ty != r_ty {
                    return Err(format!("Type mismatch in binary expression: left is {:?}, right is {:?}", l_ty, r_ty));
                }
                let result_ty = match op {
                    token::TokenType::Plus | token::TokenType::Minus | token::TokenType::Star
                    | token::TokenType::Slash | token::TokenType::Mod => {
                        if !l_ty.is_numeric() && l_ty != symbol_table::Type::String {
                            return Err(format!("Cannot perform arithmetic on type {:?}", l_ty));
                        }
                        l_ty.clone()
                    }
                    token::TokenType::Greater | token::TokenType::GreaterEqual
                    | token::TokenType::Less | token::TokenType::LessEqual
                    | token::TokenType::EqualEqual | token::TokenType::BangEqual => symbol_table::Type::Bool,
                    token::TokenType::And | token::TokenType::Or => {
                        if l_ty != symbol_table::Type::Bool {
                            return Err(format!("Logical operators require Bool, found {:?}", l_ty));
                        }
                        symbol_table::Type::Bool
                    }
                    _ => return Err(format!("Unknown binary operator: {:?}", op)),
                };
                let node = ast::Node::new(
                    ast::ExprKind::Binary { left: Box::new(l_expr), op, right: Box::new(r_expr) },
                    pos,
                );
                Ok((node, result_ty))
            }
            ast::ExprKind::Grouping(inner) => {
                let (r_expr, ty) = self.analyze_expr(*inner)?;
                Ok((ast::Node::new(ast::ExprKind::Grouping(Box::new(r_expr)), pos), ty))
            }
            ast::ExprKind::Call { callee, arguments } => self.analyze_call_expr(*callee, arguments),
            ast::ExprKind::Index { target, index } => self.analyze_index_expr(*target, *index),
            ast::ExprKind::Member { object, field } => self.analyze_member_expr(*object, field),
            other => Err(format!("Unknown expression kind: {:#?}", other)),
        }
    }

    // fn analyze_unary_expr(
    //     &mut self,
    //     op: token::TokenType,
    //     right: ast::Expr,
    // ) -> Result<symbol_table::Type, String> {
    //     let right_type = self.analyze_expr(right)?;

    //     match op {
    //         token::TokenType::Minus => {
    //             if right_type.is_numeric() {
    //                 Ok(right_type)
    //             } else {
    //                 Err(format!("Cannot use '-' on type {:?}", right_type))
    //             }
    //         }
    //         token::TokenType::Bang => {
    //             if right_type == symbol_table::Type::Bool {
    //                 Ok(symbol_table::Type::Bool)
    //             } else {
    //                 Err(format!("Cannot use '!' on type {:?}", right_type))
    //             }
    //         }
    //         _ => Err(format!("Unknown unary operator {:?}", op)),
    //     }
    // }

    // fn analyze_binary_expr(
    //     &mut self,
    //     left: ast::Expr,
    //     op: token::TokenType,
    //     right: ast::Expr,
    // ) -> Result<symbol_table::Type, String> {
    //     let left_type = self.analyze_expr(left)?;
    //     let right_type = self.analyze_expr(right)?;

    //     if left_type != right_type {
    //         return Err(format!(
    //             "Type mismatch in binary expression: left is {:?}, right is {:?}",
    //             left_type, right_type
    //         ));
    //     }

    //     match op {
    //         token::TokenType::Plus
    //         | token::TokenType::Minus
    //         | token::TokenType::Star
    //         | token::TokenType::Slash
    //         | token::TokenType::Mod => {
    //             if !left_type.is_numeric() && left_type != symbol_table::Type::String {
    //                 return Err(format!("Cannot perform arithmetic on type {:?}", left_type));
    //             }
    //             Ok(left_type)
    //         }
    //         token::TokenType::Greater
    //         | token::TokenType::GreaterEqual
    //         | token::TokenType::Less
    //         | token::TokenType::LessEqual
    //         | token::TokenType::EqualEqual
    //         | token::TokenType::BangEqual => Ok(symbol_table::Type::Bool),

    //         token::TokenType::And | token::TokenType::Or => {
    //             if left_type != symbol_table::Type::Bool {
    //                 return Err(format!(
    //                     "Logical operators require Bool, found {:?}",
    //                     left_type
    //                 ));
    //             }
    //             Ok(symbol_table::Type::Bool)
    //         }
    //         _ => Err(format!("Unknown binary operator: {:?}", op)),
    //     }
    // }

    fn analyze_call_expr(
        &mut self,
        callee: ast::Expr,
        arguments: Vec<ast::Expr>,
    ) -> Result<(ast::Expr, symbol_table::Type), String> {
        let pos = callee.pos.clone();
        match callee.value {
            ast::ExprKind::Identifier(name) => self.analyze_direct_call(name, arguments, pos),
            ast::ExprKind::Member { object, field } => self.analyze_namespaced_call(*object, field, arguments, pos),
            _ => Err("Callee must be an identifier or a module member".to_string()),
        }
    }

    fn analyze_direct_call(
        &mut self,
        func_name: String,
        arguments: Vec<ast::Expr>,
        pos: token::Position,
    ) -> Result<(ast::Expr, symbol_table::Type), String> {
        if let Some(symbol) = self.symbols.resolve(&func_name) {
            let (params, return_type) = match &symbol.kind {
                symbol_table::SymbolKind::FuncDecl { params, return_type } => (params.clone(), return_type.clone()),
                _ => return Err(format!("'{}' is not a function", func_name)),
            };
            let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
            Self::check_arg_types(&func_name, &params, &arg_types)?;
            return Ok((Self::make_call(&func_name, rewritten_args, pos), return_type));
        }

        if let Some(template) = self.generic_templates.get(&func_name).cloned() {
            let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
            let (mangled, params, return_type) = self.instantiate_generic(&func_name, None, &template, &arg_types)?;
            Self::check_arg_types(&mangled, &params, &arg_types)?;
            return Ok((Self::make_call(&mangled, rewritten_args, pos), return_type));
        }

        if let Some((generics, params, ret)) = self.generic_extern_templates.get(&func_name).cloned() {
            let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
            let (mangled, out_params, return_type) =
                self.instantiate_generic_extern(&func_name, &generics, &params, &ret, &arg_types)?;
            Self::check_arg_types(&mangled, &out_params, &arg_types)?;
            return Ok((Self::make_call(&mangled, rewritten_args, pos), return_type));
        }

        Err(format!("Undefined function: '{}'", func_name))
    }

    fn analyze_namespaced_call(
        &mut self,
        object: ast::Expr,
        field: String,
        arguments: Vec<ast::Expr>,
        pos: token::Position,
    ) -> Result<(ast::Expr, symbol_table::Type), String> {
        let module_name = match &object.value {
            ast::ExprKind::Identifier(name) => name.clone(),
            _ => return Err("Only 'module.function(...)' calls are supported".to_string()),
        };

        let module_symbols = match self.symbols.resolve(&module_name) {
            Some(symbol) => match &symbol.kind {
                symbol_table::SymbolKind::Module { symbols } => Some(symbols.clone()),
                _ => return Err(format!("'{}' is not an imported module", module_name)),
            },
            None => return Err(format!("Undefined module: '{}'", module_name)),
        };

        let full_name = format!("{}_{}", module_name, field);

        if let Some(symbols) = &module_symbols {
            if let Some(sym) = symbols.get(&field) {
                let (params, return_type) = match &sym.kind {
                    symbol_table::SymbolKind::FuncDecl { params, return_type } => (params.clone(), return_type.clone()),
                    _ => return Err(format!("'{}' in module '{}' is not a function", field, module_name)),
                };
                let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
                Self::check_arg_types(&full_name, &params, &arg_types)?;
                return Ok((Self::make_call(&full_name, rewritten_args, pos), return_type));
            }
        }

        if let Some(template) = self.generic_templates.get(&full_name).cloned() {
            let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
            let (mangled, params, return_type) =
                self.instantiate_generic(&full_name, Some(&module_name), &template, &arg_types)?;
            Self::check_arg_types(&mangled, &params, &arg_types)?;
            return Ok((Self::make_call(&mangled, rewritten_args, pos), return_type));
        }

        if let Some((generics, params, ret)) = self.generic_extern_templates.get(&full_name).cloned() {
            let (rewritten_args, arg_types) = self.analyze_arguments(arguments)?;
            let (mangled, out_params, return_type) =
                self.instantiate_generic_extern(&full_name, &generics, &params, &ret, &arg_types)?;
            Self::check_arg_types(&mangled, &out_params, &arg_types)?;
            return Ok((Self::make_call(&mangled, rewritten_args, pos), return_type));
        }

        Err(format!("Module '{}' has no public member '{}'", module_name, field))
    }

    fn analyze_arguments(&mut self, arguments: Vec<ast::Expr>) -> Result<(Vec<ast::Expr>, Vec<symbol_table::Type>), String> {
        let mut rewritten = Vec::with_capacity(arguments.len());
        let mut types = Vec::with_capacity(arguments.len());
        for arg in arguments {
            let (r_expr, ty) = self.analyze_expr(arg)?;
            rewritten.push(r_expr);
            types.push(ty);
        }
        Ok((rewritten, types))
    }

    fn check_arg_types(
        callee_name: &str,
        params: &[(String, symbol_table::Type)],
        arg_types: &[symbol_table::Type],
    ) -> Result<(), String> {
        if arg_types.len() != params.len() {
            return Err(format!(
                "Function '{}' expects {} arguments, got {}",
                callee_name, params.len(), arg_types.len()
            ));
        }
        for (i, arg_type) in arg_types.iter().enumerate() {
            let expected = &params[i].1;
            if arg_type != expected {
                return Err(format!(
                    "Argument {} of '{}': expected {:?}, got {:?}",
                    i + 1, callee_name, expected, arg_type
                ));
            }
        }
        Ok(())
    }

    fn make_call(name: &str, arguments: Vec<ast::Expr>, pos: token::Position) -> ast::Expr {
        ast::Node::new(
            ast::ExprKind::Call {
                callee: Box::new(ast::Node::new(ast::ExprKind::Identifier(name.to_string()), pos.clone())),
                arguments,
            },
            pos,
        )
    }

    fn analyze_index_expr(&mut self, target: ast::Expr, index: ast::Expr) -> Result<(ast::Expr, symbol_table::Type), String> {
        let pos = target.pos.clone();
        let (t_expr, target_type) = self.analyze_expr(target)?;
        let (i_expr, index_type) = self.analyze_expr(index)?;

        if !index_type.is_numeric() {
            return Err(format!("Index must be a numeric type, found {:?}", index_type));
        }

        let elem_ty = match target_type {
            symbol_table::Type::Array { element, .. } => *element,
            symbol_table::Type::String => symbol_table::Type::Char,
            other => return Err(format!("Cannot index into type {:?}", other)),
        };

        let node = ast::Node::new(ast::ExprKind::Index { target: Box::new(t_expr), index: Box::new(i_expr) }, pos);
        Ok((node, elem_ty))
    }

    fn analyze_member_expr(&mut self, object: ast::Expr, field: String) -> Result<(ast::Expr, symbol_table::Type), String> {
        let pos = object.pos.clone();

        let module_name = if let ast::ExprKind::Identifier(n) = &object.value { Some(n.clone()) } else { None };

        if let Some(name) = module_name {
            if let Some(symbol) = self.symbols.resolve(&name) {
                if let symbol_table::SymbolKind::Module { symbols } = &symbol.kind {
                    return match symbols.get(&field) {
                        Some(sym) => match &sym.kind {
                            symbol_table::SymbolKind::Variable { var_type, .. } => {
                                let ty = var_type.clone();
                                let node = ast::Node::new(ast::ExprKind::Member { object: Box::new(object), field }, pos);
                                Ok((node, ty))
                            }
                            symbol_table::SymbolKind::FuncDecl { .. } => {
                                Err(format!("'{}.{}' is a function — call it with ()", name, field))
                            }
                            _ => Err(format!("'{}' in module '{}' cannot be used as a value", field, name)),
                        },
                        None => Err(format!("Module '{}' has no public member '{}'", name, field)),
                    };
                }
            }
        }

        let (obj_expr, object_type) = self.analyze_expr(object)?;
        match object_type {
            symbol_table::Type::Struct(struct_name) => match self.symbols.resolve(&struct_name) {
                Some(symbol) => match &symbol.kind {
                    symbol_table::SymbolKind::StructDecl { fields } => match fields.get(&field) {
                        Some(f_type) => {
                            let ty = f_type.clone();
                            let node = ast::Node::new(ast::ExprKind::Member { object: Box::new(obj_expr), field }, pos);
                            Ok((node, ty))
                        }
                        None => Err(format!("Struct '{}' has no field '{}'", struct_name, field)),
                    },
                    _ => Err(format!("'{}' is not a struct", struct_name)),
                },
                None => Err(format!("Undefined struct: '{}'", struct_name)),
            },
            other => Err(format!("Cannot access field '{}' on type {:?}", field, other)),
        }
    }

    fn analyze_stmt(&mut self, stmt: ast::Stmt) -> Result<ast::Stmt, String> {
        let pos = stmt.pos.clone();
        match stmt.value {
            ast::StmtKind::ExprStmt(expr) => {
                let (r_expr, _) = self.analyze_expr(expr)?;
                Ok(ast::Node::new(ast::StmtKind::ExprStmt(r_expr), pos))
            }
            ast::StmtKind::Let { name, mutable, r#type, initializer } => {
                let (_, rewritten_init) = self.analyze_let_stmt(name.clone(), r#type.clone(), mutable, initializer)?;
                Ok(ast::Node::new(ast::StmtKind::Let { name, mutable, r#type, initializer: rewritten_init }, pos))
            }
            ast::StmtKind::ConstStmt { is_public, name, r#type, value } => {
                let (_, rewritten_init) = self.analyze_let_stmt(name.clone(), Some(r#type.clone()), false, Some(value))?;
                Ok(ast::Node::new(
                    ast::StmtKind::ConstStmt {
                        is_public, name, r#type,
                        value: rewritten_init.expect("const always has an initializer"),
                    },
                    pos,
                ))
            }
            ast::StmtKind::Assign { target, operator, value } => {
                let rewritten_value = self.analyze_assign_stmt(target.clone(), value)?;
                Ok(ast::Node::new(ast::StmtKind::Assign { target, operator, value: rewritten_value }, pos))
            }
            ast::StmtKind::Return(ret_expr) => {
                let rewritten = self.analyze_return_stmt(ret_expr)?;
                Ok(ast::Node::new(ast::StmtKind::Return(rewritten), pos))
            }
            ast::StmtKind::Block(body) => {
                let rewritten = self.analyze_block_stmt(body)?;
                Ok(ast::Node::new(ast::StmtKind::Block(rewritten), pos))
            }
            ast::StmtKind::If { condition, then_branch, else_branch } => {
                let (r_cond, r_then, r_else) = self.analyze_if_stmt(condition, then_branch, else_branch)?;
                Ok(ast::Node::new(ast::StmtKind::If { condition: r_cond, then_branch: r_then, else_branch: r_else }, pos))
            }
            ast::StmtKind::While { condition, body } => {
                let (r_cond, r_body) = self.analyze_while_stmt(condition, body)?;
                Ok(ast::Node::new(ast::StmtKind::While { condition: r_cond, body: r_body }, pos))
            }
            ast::StmtKind::For { iterator, iterable, body } => {
                eprintln!("Warning: 'for' not yet implemented in semantic analysis");
                Ok(ast::Node::new(ast::StmtKind::For { iterator, iterable, body }, pos))
            }
            ast::StmtKind::Match { expr, arms } => {
                eprintln!("Warning: 'match' not yet implemented in semantic analysis");
                Ok(ast::Node::new(ast::StmtKind::Match { expr, arms }, pos))
            }
            other => Err(format!("Unknown statement kind: {:?}", other)),
        }
    }

    fn analyze_let_stmt(
        &mut self,
        name: String,
        ty: Option<ast::TypeExpr>,
        mutable: bool,
        initializer: Option<ast::Expr>,
    ) -> Result<(symbol_table::Type, Option<ast::Expr>), String> {
        let (var_type, rewritten_init) = match (ty, initializer) {
            (Some(type_expr), Some(init_expr)) => {
                let declared = convert_type_expr(&type_expr);
                let (r_init, found) = self.analyze_expr(init_expr)?;
                if declared != found {
                    return Err(format!("Type mismatch for '{}': expected {:?}, found {:?}", name, declared, found));
                }
                (declared, Some(r_init))
            }
            (Some(type_expr), None) => (convert_type_expr(&type_expr), None),
            (None, Some(init_expr)) => {
                let (r_init, found) = self.analyze_expr(init_expr)?;
                (found, Some(r_init))
            }
            (None, None) => return Err(format!("Variable '{}' must have a type annotation or initializer", name)),
        };

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::Variable { var_type: var_type.clone(), value: None, mutable },
        };
        self.symbols.define(&name, symbol).map_err(|e| format!("Semantic Error: {}", e))?;

        Ok((var_type, rewritten_init))
    }

    fn analyze_assign_stmt(&mut self, target: ast::Expr, value: ast::Expr) -> Result<ast::Expr, String> {
        let name = match &target.value {
            ast::ExprKind::Identifier(n) => n.clone(),
            _ => return Err("Assignment target must be an identifier".to_string()),
        };

        let (is_mut, target_type) = if let Some(symbol) = self.symbols.resolve(&name) {
            match &symbol.kind {
                symbol_table::SymbolKind::Variable { mutable, var_type, .. } => (*mutable, var_type.clone()),
                _ => return Err(format!("'{}' is not a variable", name)),
            }
        } else {
            return Err(format!("Undefined variable '{}'", name));
        };

        if !is_mut {
            return Err(format!("Cannot assign to immutable variable '{}'", name));
        }

        let (rewritten_value, val_type) = self.analyze_expr(value)?;
        if target_type != val_type {
            return Err(format!("Type mismatch in assignment to '{}': expected {:?}, found {:?}", name, target_type, val_type));
        }

        Ok(rewritten_value)
    }

    fn analyze_return_stmt(&mut self, ret_expr: Option<ast::Expr>) -> Result<Option<ast::Expr>, String> {
        let func_block = self.curr_func_block.clone()
            .ok_or_else(|| "Return statement outside of function".to_string())?;

        match ret_expr {
            Some(expr) => {
                let (r_expr, ret_type) = self.analyze_expr(expr)?;
                if func_block.curr_ret_type != ret_type {
                    return Err(format!(
                        "Return type mismatch in '{}': expected {:?}, found {:?}",
                        func_block.current_func_name, func_block.curr_ret_type, ret_type
                    ));
                }
                Ok(Some(r_expr))
            }
            None => {
                if func_block.curr_ret_type != symbol_table::Type::Unit {
                    return Err(format!(
                        "Function '{}' must return {:?} but returns nothing",
                        func_block.current_func_name, func_block.curr_ret_type
                    ));
                }
                Ok(None)
            }
        }
    }

    fn analyze_block_stmt(&mut self, body: Vec<ast::Stmt>) -> Result<Vec<ast::Stmt>, String> {
        self.symbols.enter_scope();
        let mut rewritten = Vec::with_capacity(body.len());
        for stmt in body {
            rewritten.push(self.analyze_stmt(stmt)?);
        }
        self.symbols.exit_scope().map_err(|e| format!("Semantic Error: {}", e))?;
        Ok(rewritten)
    }

    fn analyze_if_stmt(
        &mut self,
        condition: ast::Expr,
        then_branch: Box<ast::Stmt>,
        else_branch: Option<Box<ast::Stmt>>,
    ) -> Result<(ast::Expr, Box<ast::Stmt>, Option<Box<ast::Stmt>>), String> {
        let (r_cond, cond_type) = self.analyze_expr(condition)?;
        if cond_type != symbol_table::Type::Bool {
            return Err(format!("If condition must be Bool, found {:?}", cond_type));
        }
        let r_then = Box::new(self.analyze_stmt(*then_branch)?);
        let r_else = match else_branch {
            Some(else_stmt) => Some(Box::new(self.analyze_stmt(*else_stmt)?)),
            None => None,
        };
        Ok((r_cond, r_then, r_else))
    }

    fn analyze_while_stmt(&mut self, condition: ast::Expr, body: Box<ast::Stmt>) -> Result<(ast::Expr, Box<ast::Stmt>), String> {
        let (r_cond, cond_type) = self.analyze_expr(condition)?;
        if cond_type != symbol_table::Type::Bool {
            return Err(format!("While condition must be Bool, found {:?}", cond_type));
        }
        let r_body = Box::new(self.analyze_stmt(*body)?);
        Ok((r_cond, r_body))
    }

    fn analyze_decl(&mut self, decl: ast::Decl) -> Result<ast::Decl, String> {
        match decl {
            ast::Decl::Import { path } => {
                self.analyze_import_decl(&path)?;
                Ok(ast::Decl::Import { path })
            }
            ast::Decl::ConstDecl { is_public, name, r#type, value } => {
                let (_, rewritten_init) = self.analyze_let_stmt(name.clone(), Some(r#type.clone()), false, Some(value))?;
                Ok(ast::Decl::ConstDecl {
                    is_public, name, r#type,
                    value: rewritten_init.expect("const always has an initializer"),
                })
            }
            ast::Decl::Type { is_public, name, r#type } => {
                self.analyze_type_decl(name.clone(), r#type.clone());
                Ok(ast::Decl::Type { is_public, name, r#type })
            }
            ast::Decl::ExternFunc { is_public, name, generics, params, return_type } => {
                if generics.is_empty() {
                    self.analyze_extern_func_decl(name.clone(), params.clone(), return_type.clone())?;
                } else {
                    self.generic_extern_templates.insert(name.clone(), (generics.clone(), params.clone(), return_type.clone()));
                }
                Ok(ast::Decl::ExternFunc { is_public, name, generics, params, return_type })
            }
            ast::Decl::Func(func) => {
                if func.generics.is_empty() {
                    Ok(ast::Decl::Func(self.analyze_func_decl(func)?))
                } else {
                    self.generic_templates.insert(func.name.clone(), func.clone());
                    Ok(ast::Decl::Func(func))
                }
            }
            ast::Decl::Struct { is_public, name, fields } => {
                self.analyze_struct_decl(name.clone(), fields.clone())?;
                Ok(ast::Decl::Struct { is_public, name, fields })
            }
            ast::Decl::Enum { is_public, name, variants } => {
                eprintln!("Warning: enums not yet implemented in semantic analysis");
                Ok(ast::Decl::Enum { is_public, name, variants })
            }
            ast::Decl::Construct { name, methods } => {
                let mut rewritten_methods = Vec::with_capacity(methods.len());
                for method in methods {
                    rewritten_methods.push(self.analyze_func_decl(method)?);
                }
                Ok(ast::Decl::Construct { name, methods: rewritten_methods })
            }
        }
    }

    fn analyze_import_decl(&mut self, path: &str) -> Result<(), String> {
        let namespace = Self::namespace_from_path(path);
        let (source, module_dir, module_id) = Self::load_module_source(path, &self.base_dir)?;

        if self.import_chain.contains(&module_id) {
            let mut chain_display = self.import_chain.clone();
            chain_display.push(module_id);
            return Err(format!("Circular import detected: {}", chain_display.join(" -> ")));
        }

        let full_program = Self::parse_module(&source)?;

        let exported_names: std::collections::HashSet<String> = full_program
            .iter()
            .filter(|node| Self::is_public_decl(&node.value))
            .filter_map(|node| Self::decl_name(&node.value).map(|s| s.to_string()))
            .collect();

        let mut next_chain = self.import_chain.clone();
        next_chain.push(module_id);

        let mut module_analyzer = SemanticAnalyzer::new(&full_program)
            .with_base_dir(module_dir.unwrap_or_else(|| self.base_dir.clone()))
            .with_import_chain(next_chain);

        let full_symbols = module_analyzer.analyze_program().into_root_scope();
        let resolved_module_program = module_analyzer.resolved_ast.clone();

        self.imported_envs.insert(
            namespace.clone(),
            (
                full_symbols.clone(),
                module_analyzer.generic_templates.clone(),
                module_analyzer.generic_extern_templates.clone(),
            ),
        );

        for (nested_ns, nested_program) in module_analyzer.imported_modules.drain() {
            self.imported_modules.entry(nested_ns).or_insert(nested_program);
        }

        for (name, template) in module_analyzer.generic_templates.drain() {
            if exported_names.contains(&name) {
                self.generic_templates.insert(format!("{}_{}", namespace, name), template);
            }
        }
        for (name, (generics, params, ret)) in module_analyzer.generic_extern_templates.drain() {
            if exported_names.contains(&name) {
                self.generic_extern_templates
                    .insert(format!("{}_{}", namespace, name), (generics, params, ret));
            }
        }
        self.monomorphized.extend(module_analyzer.monomorphized.drain(..));
        self.monomorphized_externs.extend(module_analyzer.monomorphized_externs.drain(..));

        let module_symbols: HashMap<String, symbol_table::Symbol> = full_symbols
            .into_iter()
            .filter(|(name, _)| exported_names.contains(name))
            .collect();

        self.imported_modules.insert(namespace.clone(), resolved_module_program);

        let module_symbol = symbol_table::Symbol {
            name: namespace.clone(),
            kind: symbol_table::SymbolKind::Module { symbols: module_symbols },
        };

        self.symbols
            .define(&namespace, module_symbol)
            .map_err(|e| format!("Semantic Error: {}", e))
    }

    fn analyze_program_owned(mut self) -> symbol_table::SymbolTable {
        self.analyze_program()
    }

    fn namespace_from_path(path: &str) -> String {
        path.rsplit('/')
            .next()
            .unwrap_or(path)
            .trim_end_matches(".gyro")
            .to_string()
    }

    fn decl_name(decl: &ast::Decl) -> Option<&str> {
        match decl {
            ast::Decl::Func(f) => Some(&f.name),
            ast::Decl::Struct { name, .. } => Some(name),
            ast::Decl::ConstDecl { name, .. } => Some(name),
            ast::Decl::Type { name, .. } => Some(name),
            ast::Decl::ExternFunc { name, .. } => Some(name),
            _ => None,
        }
    }

    fn is_public_decl(decl: &ast::Decl) -> bool {
        match decl {
            ast::Decl::Func(f) => f.is_public,
            ast::Decl::Struct { is_public, .. } => *is_public,
            ast::Decl::ConstDecl { is_public, .. } => *is_public,
            ast::Decl::Type { is_public, .. } => *is_public,
            ast::Decl::ExternFunc { is_public, .. } => *is_public,
            _ => false,
        }
    }

    fn load_module_source(
        path: &str,
        base_dir: &Path,
    ) -> Result<(String, Option<PathBuf>, String), String> {
        if path.starts_with("./") || path.starts_with("../") {
            let mut file_path = base_dir.join(path);
            if file_path.extension().is_none() {
                file_path.set_extension("gyro");
            }

            let canonical = std::fs::canonicalize(&file_path).map_err(|e| {
                format!(
                    "Cannot resolve imported file '{}': {}",
                    file_path.display(),
                    e
                )
            })?;

            let source = std::fs::read_to_string(&canonical).map_err(|e| {
                format!("Cannot read imported file '{}': {}", canonical.display(), e)
            })?;
            let module_dir = canonical.parent().map(|p| p.to_path_buf());
            let module_id = canonical.to_string_lossy().to_string();

            Ok((source, module_dir, module_id))
        } else {
            match crate::codegen::stdlib_src::lookup(path) {
                Some(src) => Ok((src.to_string(), None, path.to_string())),
                None => Err(format!("Unknown standard library module: '{}'", path)),
            }
        }
    }

    fn parse_module(source: &str) -> Result<ast::Program, String> {
        let mut state = crate::gyro::State::new();
        let mut scanner = crate::scanner::Scanner::new(source, &mut state);
        let (tokens, had_error) = scanner.scan_tokens();
        if had_error {
            return Err("Lexical error in imported module".to_string());
        }
        let mut parser = crate::parser::Parser::new(tokens);
        parser.parse()
    }

    fn analyze_type_decl(&mut self, name: String, ty: ast::TypeExpr) {
        let target_type = convert_type_expr(&ty);

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::TypeAlias { target_type },
        };

        if let Err(e) = self.symbols.define(&name, symbol) {
            eprintln!("Semantic Error: {}", e);
        }
    }

    fn substitute_type_expr(t: &ast::TypeExpr, subst: &HashMap<String, ast::TypeExpr>) -> ast::TypeExpr {
        match t {
            ast::TypeExpr::Named(name) => subst.get(name).cloned().unwrap_or_else(|| t.clone()),
            ast::TypeExpr::Array { size, element } => ast::TypeExpr::Array {
                size: *size,
                element: Box::new(Self::substitute_type_expr(element, subst)),
            },
            ast::TypeExpr::Pointer { kind, target } => ast::TypeExpr::Pointer {
                kind: kind.clone(),
                target: Box::new(Self::substitute_type_expr(target, subst)),
            },
            ast::TypeExpr::Generic(name, args) => ast::TypeExpr::Generic(
                name.clone(),
                args.iter().map(|a| Self::substitute_type_expr(a, subst)).collect(),
            ),
        }
    }

    fn substitute_stmt(stmt: &ast::Stmt, subst: &HashMap<String, ast::TypeExpr>) -> ast::Stmt {
        let new_kind = match &stmt.value {
            ast::StmtKind::Let { name, mutable, r#type, initializer } => ast::StmtKind::Let {
                name: name.clone(),
                mutable: *mutable,
                r#type: r#type.as_ref().map(|t| Self::substitute_type_expr(t, subst)),
                initializer: initializer.clone(),
            },
            ast::StmtKind::ConstStmt { is_public, name, r#type, value } => ast::StmtKind::ConstStmt {
                is_public: *is_public,
                name: name.clone(),
                r#type: Self::substitute_type_expr(r#type, subst),
                value: value.clone(),
            },
            ast::StmtKind::Block(stmts) => {
                ast::StmtKind::Block(stmts.iter().map(|s| Self::substitute_stmt(s, subst)).collect())
            }
            ast::StmtKind::If { condition, then_branch, else_branch } => ast::StmtKind::If {
                condition: condition.clone(),
                then_branch: Box::new(Self::substitute_stmt(then_branch, subst)),
                else_branch: else_branch.as_ref().map(|b| Box::new(Self::substitute_stmt(b, subst))),
            },
            ast::StmtKind::While { condition, body } => ast::StmtKind::While {
                condition: condition.clone(),
                body: Box::new(Self::substitute_stmt(body, subst)),
            },
            ast::StmtKind::For { iterator, iterable, body } => ast::StmtKind::For {
                iterator: iterator.clone(),
                iterable: iterable.clone(),
                body: Box::new(Self::substitute_stmt(body, subst)),
            },
            ast::StmtKind::Loop(body) => ast::StmtKind::Loop(Box::new(Self::substitute_stmt(body, subst))),
            ast::StmtKind::Match { expr, arms } => ast::StmtKind::Match {
                expr: expr.clone(),
                arms: arms
                    .iter()
                    .map(|(p, stmts)| (p.clone(), stmts.iter().map(|s| Self::substitute_stmt(s, subst)).collect()))
                    .collect(),
            },
            other => other.clone(),
        };
        ast::Node::new(new_kind, stmt.pos.clone())
    }

    fn instantiate_generic_extern(
        &mut self,
        base_name: &str,
        generics: &[String],
        params: &[(String, ast::TypeExpr)],
        return_type: &Option<ast::TypeExpr>,
        arg_types: &[symbol_table::Type],
    ) -> Result<(String, Vec<(String, symbol_table::Type)>, symbol_table::Type), String> {
        let subst = Self::infer_generic_args(base_name, generics, params, arg_types)?;

        let suffix = generics.iter().map(|g| Self::type_expr_suffix(subst.get(g).unwrap())).collect::<Vec<_>>().join("_");
        let mangled = format!("{}__{}", base_name, suffix);

        if let Some(symbol) = self.symbols.resolve(&mangled) {
            if let symbol_table::SymbolKind::FuncDecl { params, return_type } = &symbol.kind {
                return Ok((mangled.clone(), params.clone(), return_type.clone()));
            }
        }

        let concrete_params: Vec<(String, ast::TypeExpr)> = params.iter()
            .map(|(n, t)| (n.clone(), Self::substitute_type_expr(t, &subst))).collect();
        let concrete_return = return_type.as_ref().map(|t| Self::substitute_type_expr(t, &subst));

        self.analyze_extern_func_decl(mangled.clone(), concrete_params.clone(), concrete_return.clone())?;
        self.monomorphized_externs.push((mangled.clone(), concrete_params, concrete_return));

        let symbol = self.symbols.resolve(&mangled).expect("just registered");
        if let symbol_table::SymbolKind::FuncDecl { params, return_type } = &symbol.kind {
            Ok((mangled, params.clone(), return_type.clone()))
        } else { unreachable!() }
    }

    fn substitute_func_decl(template: &ast::FuncDecl, subst: &HashMap<String, ast::TypeExpr>) -> ast::FuncDecl {
        ast::FuncDecl {
            is_public: template.is_public,
            name: template.name.clone(),
            generics: Vec::new(), // fully concrete now — no longer generic
            params: template
                .params
                .iter()
                .map(|(n, t)| (n.clone(), Self::substitute_type_expr(t, subst)))
                .collect(),
            return_type: template.return_type.as_ref().map(|t| Self::substitute_type_expr(t, subst)),
            body: template.body.iter().map(|s| Self::substitute_stmt(s, subst)).collect(),
        }
    }

    fn analyze_extern_func_decl(
        &mut self,
        name: String,
        params: Vec<(String, ast::TypeExpr)>,
        return_type: Option<ast::TypeExpr>,
    ) -> Result<(), String> {
        let mut func_params = Vec::new();
        for (p_name, p_type) in params {
            let converted = convert_type_expr(&p_type);
            func_params.push((p_name, converted));
        }
        let ret_type = match return_type {
            Some(ty) => convert_type_expr(&ty),
            None => symbol_table::Type::Unit,
        };

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::FuncDecl { params: func_params, return_type: ret_type },
        };

        self.symbols.define(&name, symbol).map_err(|e| format!("Semantic Error: {}", e))
    }

    fn instantiate_generic(
        &mut self,
        base_name: &str,
        home_namespace: Option<&str>,
        template: &ast::FuncDecl,
        arg_types: &[symbol_table::Type],
    ) -> Result<(String, Vec<(String, symbol_table::Type)>, symbol_table::Type), String> {
        let subst = Self::infer_generic_args(&template.name, &template.generics, &template.params, arg_types)?;
        let suffix = template.generics.iter().map(|g| Self::type_expr_suffix(subst.get(g).unwrap())).collect::<Vec<_>>().join("_");
        let mangled = format!("{}__{}", base_name, suffix);

        if let Some(symbol) = self.symbols.resolve(&mangled) {
            if let symbol_table::SymbolKind::FuncDecl { params, return_type } = &symbol.kind {
                return Ok((mangled.clone(), params.clone(), return_type.clone()));
            }
        }

        let mut concrete_decl = Self::substitute_func_decl(template, &subst);
        concrete_decl.name = mangled.clone();

        let analyzed = self.with_home_env(home_namespace, |slf| slf.analyze_func_decl(concrete_decl))?;
        self.monomorphized.push(analyzed);

        let symbol = self.symbols.resolve(&mangled).expect("just registered above");
        if let symbol_table::SymbolKind::FuncDecl { params, return_type } = &symbol.kind {
            Ok((mangled, params.clone(), return_type.clone()))
        } else {
            unreachable!()
        }
    }

    fn with_home_env<T>(&mut self, home_namespace: Option<&str>, f: impl FnOnce(&mut Self) -> T) -> T {
        let Some(ns) = home_namespace else { return f(self); };
        let Some((home_symbols, home_templates, home_extern_templates)) =
            self.imported_envs.get(ns).cloned()
        else {
            return f(self);
        };

        let mut added_keys = Vec::new();
        {
            let global = self.symbols.global_scope_mut();
            for (name, symbol) in &home_symbols {
                if !global.contains_key(name) {
                    global.insert(name.clone(), symbol.clone());
                    added_keys.push(name.clone());
                }
            }
        }

        let saved_templates = self.generic_templates.clone();
        let saved_extern_templates = self.generic_extern_templates.clone();
        for (k, v) in &home_templates {
            self.generic_templates.entry(k.clone()).or_insert_with(|| v.clone());
        }
        for (k, v) in &home_extern_templates {
            self.generic_extern_templates.entry(k.clone()).or_insert_with(|| v.clone());
        }

        let result = f(self);

        let global = self.symbols.global_scope_mut();
        for key in &added_keys {
            global.remove(key);
        }
        self.generic_templates = saved_templates;
        self.generic_extern_templates = saved_extern_templates;

        result
    }

    fn analyze_func_decl(&mut self, func_decl: ast::FuncDecl) -> Result<ast::FuncDecl, String> {
        let name = func_decl.name.clone();
        let mut func_params = Vec::new();
        for param in &func_decl.params {
            func_params.push((param.0.clone(), convert_type_expr(&param.1)));
        }
        let ret_type = func_decl.return_type.as_ref().map(convert_type_expr).unwrap_or(symbol_table::Type::Unit);

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::FuncDecl { params: func_params.clone(), return_type: ret_type.clone() },
        };
        self.symbols.define(&name, symbol).map_err(|e| format!("Semantic Error: {}", e))?;

        let prev_func_block = self.curr_func_block.clone();
        self.curr_func_block = Some(CurrFuncBlock { current_func_name: name.clone(), curr_ret_type: ret_type.clone() });
        self.symbols.enter_scope();

        for (p_name, p_type) in &func_params {
            let param_symbol = symbol_table::Symbol {
                name: p_name.clone(),
                kind: symbol_table::SymbolKind::Variable { var_type: p_type.clone(), value: None, mutable: false },
            };
            self.symbols.define(p_name, param_symbol).map_err(|e| format!("Semantic Error: {}", e))?;
        }

        let mut rewritten_body = Vec::with_capacity(func_decl.body.len());
        for stmt in func_decl.body {
            rewritten_body.push(self.analyze_stmt(stmt)?);
        }

        self.symbols.exit_scope().map_err(|e| format!("Semantic Error: {}", e))?;
        self.curr_func_block = prev_func_block;

        Ok(ast::FuncDecl {
            is_public: func_decl.is_public,
            name: func_decl.name,
            generics: func_decl.generics,
            params: func_decl.params,
            return_type: func_decl.return_type,
            body: rewritten_body,
        })
    }

    fn analyze_struct_decl(
        &mut self,
        name: String,
        fields: Vec<(String, ast::TypeExpr)>,
    ) -> Result<(), String> {
        let mut struct_fields = HashMap::new();

        for (field_name, field_type_expr) in fields {
            let field_type = convert_type_expr(&field_type_expr);
            struct_fields.insert(field_name, field_type);
        }

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::StructDecl {
                fields: struct_fields,
            },
        };

        self.symbols
            .define(&name, symbol)
            .map_err(|e| format!("Semantic Error: {}", e))
    }

    fn type_to_type_expr(ty: &symbol_table::Type) -> Result<ast::TypeExpr, String> {
        let name = match ty {
            symbol_table::Type::Int8 => "int8", symbol_table::Type::Int16 => "int16", symbol_table::Type::Int32 => "int32",
            symbol_table::Type::Int64 => "int64", symbol_table::Type::Int128 => "int128", symbol_table::Type::IntN => "int_n",
            symbol_table::Type::UInt8 => "uint8", symbol_table::Type::UInt16 => "uint16", symbol_table::Type::UInt32 => "uint32",
            symbol_table::Type::UInt64 => "uint64", symbol_table::Type::UInt128 => "uint128", symbol_table::Type::UIntN => "uint_n",
            symbol_table::Type::Float32 => "float32", symbol_table::Type::Float64 => "float64",
            symbol_table::Type::Bool => "bool", symbol_table::Type::Char => "char", symbol_table::Type::String => "string",
            symbol_table::Type::Struct(name) => return Ok(ast::TypeExpr::Named(name.clone())),
            symbol_table::Type::Array { element, size } => {
                let element_expr = Self::type_to_type_expr(element)?;
                return Ok(ast::TypeExpr::Array { size: *size, element: Box::new(element_expr) });
            }
            symbol_table::Type::Unit => return Err("Cannot instantiate a generic parameter with Unit/void".to_string()),
        };
        Ok(ast::TypeExpr::Named(name.to_string()))
    }

    fn infer_generic_args(
        fn_name: &str,
        generics: &[String],
        params: &[(String, ast::TypeExpr)],
        arg_types: &[symbol_table::Type],
    ) -> Result<HashMap<String, ast::TypeExpr>, String> {
        if params.len() != arg_types.len() {
            return Err(format!("Function '{}' expects {} arguments, got {}", fn_name, params.len(), arg_types.len()));
        }
        let mut subst: HashMap<String, ast::TypeExpr> = HashMap::new();
        for ((_, param_type), arg_type) in params.iter().zip(arg_types.iter()) {
            if let ast::TypeExpr::Named(name) = param_type {
                if generics.contains(name) {
                    let inferred = Self::type_to_type_expr(arg_type)?;
                    if let Some(existing) = subst.get(name) {
                        if existing != &inferred {
                            return Err(format!("Conflicting types for '{}' in '{}': {:?} vs {:?}", name, fn_name, existing, inferred));
                        }
                    } else {
                        subst.insert(name.clone(), inferred);
                    }
                }
            }
        }
        for g in generics {
            if !subst.contains_key(g) {
                return Err(format!("Could not infer generic parameter '{}' for '{}'", g, fn_name));
            }
        }
        Ok(subst)
    }

    fn type_expr_suffix(t: &ast::TypeExpr) -> String {
        match t {
            ast::TypeExpr::Named(n) => n.clone(),
            ast::TypeExpr::Array { element, size } => format!(
                "arr{}_{}",
                size.map(|s| s.to_string()).unwrap_or_else(|| "n".into()),
                Self::type_expr_suffix(element)
            ),
            ast::TypeExpr::Pointer { target, .. } => format!("ptr_{}", Self::type_expr_suffix(target)),
            ast::TypeExpr::Generic(name, args) => format!(
                "{}_{}", name, args.iter().map(Self::type_expr_suffix).collect::<Vec<_>>().join("_")
            ),
        }
    }
}
