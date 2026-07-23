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
    pub monomorphized: Vec<ast::FuncDecl>,
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
            monomorphized: Vec::new(),
        }
    }

    pub fn analyze_program(&mut self) -> symbol_table::SymbolTable {
        for decl in self.ast.clone() {
            if let Err(e) = self.analyze_decl(decl.value) {
                eprintln!("Semantic Error: {}", e);
            }
        }
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

    fn analyze_expr(&mut self, expr: ast::Expr) -> Result<symbol_table::Type, String> {
        match expr.value {
            ast::ExprKind::Literal(lit) => match lit {
                token::LiteralTypes::Int(_) => Ok(symbol_table::Type::Int32),
                token::LiteralTypes::Float(_) => Ok(symbol_table::Type::Float64),
                token::LiteralTypes::String(_) => Ok(symbol_table::Type::String),
                token::LiteralTypes::Bool(_) => Ok(symbol_table::Type::Bool),
                token::LiteralTypes::Char(_) => Ok(symbol_table::Type::Char),
                _ => Err("Unknown literal type".to_string()),
            },
            ast::ExprKind::Identifier(name) => {
                if let Some(symbol) = self.symbols.resolve(&name) {
                    match &symbol.kind {
                        symbol_table::SymbolKind::Variable { var_type, .. } => Ok(var_type.clone()),
                        _ => Err(format!("'{}' is not a variable", &name)),
                    }
                } else {
                    Err(format!("Undefined variable: {}", &name))
                }
            }
            ast::ExprKind::Unary { op, right } => Ok(self.analyze_unary_expr(op, *right)?),
            ast::ExprKind::Binary { left, op, right } => {
                Ok(self.analyze_binary_expr(*left, op, *right)?)
            }
            ast::ExprKind::Grouping(inner) => Ok(self.analyze_expr(*inner)?),
            ast::ExprKind::Call { callee, arguments } => {
                Ok(self.analyze_call_expr(*callee, arguments)?)
            }
            ast::ExprKind::Index { target, index } => Ok(self.analyze_index_expr(*target, *index)?),
            ast::ExprKind::Member { object, field }  => Ok(self.analyze_member_expr(*object, field)?),
            _ => Err(format!("Unknown expression kind: {:#?}", expr.value)),
        }
    }

    fn analyze_unary_expr(
        &mut self,
        op: token::TokenType,
        right: ast::Expr,
    ) -> Result<symbol_table::Type, String> {
        let right_type = self.analyze_expr(right)?;

        match op {
            token::TokenType::Minus => {
                if right_type.is_numeric() {
                    Ok(right_type)
                } else {
                    Err(format!("Cannot use '-' on type {:?}", right_type))
                }
            }
            token::TokenType::Bang => {
                if right_type == symbol_table::Type::Bool {
                    Ok(symbol_table::Type::Bool)
                } else {
                    Err(format!("Cannot use '!' on type {:?}", right_type))
                }
            }
            _ => Err(format!("Unknown unary operator {:?}", op)),
        }
    }

    fn analyze_binary_expr(
        &mut self,
        left: ast::Expr,
        op: token::TokenType,
        right: ast::Expr,
    ) -> Result<symbol_table::Type, String> {
        let left_type = self.analyze_expr(left)?;
        let right_type = self.analyze_expr(right)?;

        if left_type != right_type {
            return Err(format!(
                "Type mismatch in binary expression: left is {:?}, right is {:?}",
                left_type, right_type
            ));
        }

        match op {
            token::TokenType::Plus
            | token::TokenType::Minus
            | token::TokenType::Star
            | token::TokenType::Slash
            | token::TokenType::Mod => {
                if !left_type.is_numeric() && left_type != symbol_table::Type::String {
                    return Err(format!("Cannot perform arithmetic on type {:?}", left_type));
                }
                Ok(left_type)
            }
            token::TokenType::Greater
            | token::TokenType::GreaterEqual
            | token::TokenType::Less
            | token::TokenType::LessEqual
            | token::TokenType::EqualEqual
            | token::TokenType::BangEqual => Ok(symbol_table::Type::Bool),

            token::TokenType::And | token::TokenType::Or => {
                if left_type != symbol_table::Type::Bool {
                    return Err(format!(
                        "Logical operators require Bool, found {:?}",
                        left_type
                    ));
                }
                Ok(symbol_table::Type::Bool)
            }
            _ => Err(format!("Unknown binary operator: {:?}", op)),
        }
    }

    fn analyze_call_expr(
        &mut self,
        callee: ast::Expr,
        arguments: Vec<ast::Expr>,
    ) -> Result<symbol_table::Type, String> {
        match callee.value {
            ast::ExprKind::Identifier(name) => self.analyze_direct_call(name, arguments),
            ast::ExprKind::Member { object, field } => {
                self.analyze_namespaced_call(*object, field, arguments)
            }
            _ => Err("Callee must be an identifier or a module member".to_string()),
        }
    }

    fn analyze_direct_call(
        &mut self,
        func_name: String,
        arguments: Vec<ast::Expr>,
    ) -> Result<symbol_table::Type, String> {
        let (params, return_type) = if let Some(symbol) = self.symbols.resolve(&func_name) {
            match &symbol.kind {
                symbol_table::SymbolKind::FuncDecl { params, return_type } => {
                    (params.clone(), return_type.clone())
                }
                _ => return Err(format!("'{}' is not a function", func_name)),
            }
        } else {
            return Err(format!("Undefined function: '{}'", func_name));
        };

        self.check_call_args(&func_name, &params, arguments)?;
        Ok(return_type)
    }

    fn analyze_namespaced_call(
        &mut self,
        object: ast::Expr,
        field: String,
        arguments: Vec<ast::Expr>,
    ) -> Result<symbol_table::Type, String> {
        let module_name = match &object.value {
            ast::ExprKind::Identifier(name) => name.clone(),
            _ => return Err("Only 'module.function(...)' calls are supported".to_string()),
        };

        let (params, return_type) = match self.symbols.resolve(&module_name) {
            Some(symbol) => match &symbol.kind {
                symbol_table::SymbolKind::Module { symbols } => match symbols.get(&field) {
                    Some(sym) => match &sym.kind {
                        symbol_table::SymbolKind::FuncDecl {
                            params,
                            return_type,
                        } => (params.clone(), return_type.clone()),
                        _ => {
                            return Err(format!(
                                "'{}' in module '{}' is not a function",
                                field, module_name
                            ));
                        }
                    },
                    None => {
                        return Err(format!(
                            "Module '{}' has no public member '{}'",
                            module_name, field
                        ));
                    }
                },
                _ => return Err(format!("'{}' is not an imported module", module_name)),
            },
            None => return Err(format!("Undefined module: '{}'", module_name)),
        };

        let full_name = format!("{}.{}", module_name, field);
        self.check_call_args(&full_name, &params, arguments)?;
        Ok(return_type)
    }

    fn check_call_args(
        &mut self,
        callee_name: &str,
        params: &[(String, symbol_table::Type)],
        arguments: Vec<ast::Expr>,
    ) -> Result<(), String> {
        if arguments.len() != params.len() {
            return Err(format!(
                "Function '{}' expects {} arguments, got {}",
                callee_name,
                params.len(),
                arguments.len()
            ));
        }

        for (i, arg_expr) in arguments.into_iter().enumerate() {
            let arg_type = self.analyze_expr(arg_expr)?;
            let expected_type = &params[i].1;
            if &arg_type != expected_type {
                return Err(format!(
                    "Argument {} of '{}': expected {:?}, got {:?}",
                    i + 1,
                    callee_name,
                    expected_type,
                    arg_type
                ));
            }
        }

        Ok(())
    }

    fn analyze_index_expr(
        &mut self,
        target: ast::Expr,
        index: ast::Expr,
    ) -> Result<symbol_table::Type, String> {
        let target_type = self.analyze_expr(target)?;
        let index_type = self.analyze_expr(index)?;

        if !index_type.is_numeric() {
            return Err(format!(
                "Index must be a numeric type, found {:?}", index_type
            ));
        }

        match target_type {
            symbol_table::Type::Array { element, .. } => Ok(*element),
            symbol_table::Type::String => Ok(symbol_table::Type::Char),
            other => Err(format!("Cannot index into type {:?}", other)),
        }
    }

    fn analyze_member_expr(
        &mut self,
        object: ast::Expr,
        field: String,
    ) -> Result<symbol_table::Type, String> {
        if let ast::ExprKind::Identifier(name) = &object.value {
            if let Some(symbol) = self.symbols.resolve(name) {
                if let symbol_table::SymbolKind::Module { symbols } = &symbol.kind {
                    return match symbols.get(&field) {
                        Some(sym) => match &sym.kind {
                            symbol_table::SymbolKind::Variable { var_type, .. } => {
                                Ok(var_type.clone())
                            }
                            symbol_table::SymbolKind::FuncDecl { .. } => Err(format!(
                                "'{}.{}' is a function — call it with ()", name, field
                            )),
                            _ => Err(format!(
                                "'{}' in module '{}' cannot be used as a value", field, name
                            )),
                        },
                        None => Err(format!(
                            "Module '{}' has no public member '{}'", name, field
                        )),
                    };
                }
            }
        }

        let object_type = self.analyze_expr(object)?;
        match object_type {
            symbol_table::Type::Struct(struct_name) => match self.symbols.resolve(&struct_name) {
                Some(symbol) => match &symbol.kind {
                    symbol_table::SymbolKind::StructDecl { fields } => match fields.get(&field) {
                        Some(f_type) => Ok(f_type.clone()),
                        None => Err(format!(
                            "Struct '{}' has no field '{}'", struct_name, field
                        )),
                    },
                    _ => Err(format!("'{}' is not a struct", struct_name)),
                },
                None => Err(format!("Undefined struct: '{}'", struct_name)),
            },
            other => Err(format!("Cannot access field '{}' on type {:?}", field, other)),
        }
    }

    fn analyze_stmt(&mut self, stmt: ast::Stmt) -> Result<(), String> {
        match stmt.value {
            ast::StmtKind::ExprStmt(expr) => {
                self.analyze_expr(expr)?;
                Ok(())
            }

            ast::StmtKind::Let {
                name,
                mutable,
                r#type,
                initializer,
            } => self.analyze_let_stmt(name, r#type, mutable, initializer),

            ast::StmtKind::ConstStmt {
                name,
                r#type,
                value,
                ..
            } => self.analyze_let_stmt(name, Some(r#type), false, Some(value)),

            ast::StmtKind::Assign { target, value, .. } => self.analyze_assign_stmt(target, value),

            ast::StmtKind::Return(ret_expr) => self.analyze_return_stmt(ret_expr),

            ast::StmtKind::Block(body) => self.analyze_block_stmt(body),
            ast::StmtKind::If {
                condition,
                then_branch,
                else_branch,
            } => self.analyze_if_stmt(condition, then_branch, else_branch),
            ast::StmtKind::While { condition, body } => self.analyze_while_stmt(condition, body),
            ast::StmtKind::For { .. } => {
                eprintln!("Warning: 'for' not yet implemented in semantic analysis");
                Ok(())
            }
            ast::StmtKind::Match { .. } => {
                eprintln!("Warning: 'match' not yet implemented in semantic analysis");
                Ok(())
            }
            _ => Err(format!("Unknown statement kind: {:?}", stmt.value)),
        }
    }

    fn analyze_let_stmt(
        &mut self,
        name: String,
        ty: Option<ast::TypeExpr>,
        mutable: bool,
        initializer: Option<ast::Expr>,
    ) -> Result<(), String> {
        let var_type = match (ty, &initializer) {
            (Some(type_expr), Some(init_expr)) => {
                let declared = convert_type_expr(&type_expr);
                let found = self.analyze_expr(init_expr.clone())?;

                if declared != found {
                    return Err(format!(
                        "Type mismatch for '{}': expected {:?}, found {:?}",
                        name, declared, found
                    ));
                }
                declared
            }

            (Some(type_expr), None) => convert_type_expr(&type_expr),

            (None, Some(init_expr)) => self.analyze_expr(init_expr.clone())?,

            (None, None) => {
                return Err(format!(
                    "Variable '{}' must have a type annotation or initializer",
                    name
                ));
            }
        };

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::Variable {
                var_type,
                value: None,
                mutable,
            },
        };

        self.symbols
            .define(&name, symbol)
            .map_err(|e| format!("Semantic Error: {}", e))
    }

    fn analyze_assign_stmt(&mut self, target: ast::Expr, value: ast::Expr) -> Result<(), String> {
        let name = match target.value {
            ast::ExprKind::Identifier(n) => n,
            _ => return Err("Assignment target must be an identifier".to_string()),
        };

        let (is_mut, target_type) = if let Some(symbol) = self.symbols.resolve(&name) {
            match &symbol.kind {
                symbol_table::SymbolKind::Variable {
                    mutable, var_type, ..
                } => (*mutable, var_type.clone()),
                _ => return Err(format!("'{}' is not a variable", name)),
            }
        } else {
            return Err(format!("Undefined variable '{}'", name));
        };

        if !is_mut {
            return Err(format!("Cannot assign to immutable variable '{}'", name));
        }

        let val_type = self.analyze_expr(value)?;
        if target_type != val_type {
            return Err(format!(
                "Type mismatch in assignment to '{}': expected {:?}, found {:?}",
                name, target_type, val_type
            ));
        }

        Ok(())
    }

    fn analyze_return_stmt(&mut self, ret_expr: Option<ast::Expr>) -> Result<(), String> {
        let func_block = self
            .curr_func_block
            .clone()
            .ok_or_else(|| "Return statement outside of function".to_string())?;

        match ret_expr {
            Some(expr) => {
                let ret_type = self.analyze_expr(expr)?;
                if func_block.curr_ret_type != ret_type {
                    return Err(format!(
                        "Return type mismatch in '{}': expected {:?}, found {:?}",
                        func_block.current_func_name, func_block.curr_ret_type, ret_type
                    ));
                }
            }
            None => {
                if func_block.curr_ret_type != symbol_table::Type::Unit {
                    return Err(format!(
                        "Function '{}' must return {:?} but returns nothing",
                        func_block.current_func_name, func_block.curr_ret_type
                    ));
                }
            }
        }

        Ok(())
    }

    fn analyze_block_stmt(&mut self, body: Vec<ast::Stmt>) -> Result<(), String> {
        self.symbols.enter_scope();

        for stmt in body {
            self.analyze_stmt(stmt)?;
        }
        self.symbols
            .exit_scope()
            .map_err(|e| format!("Semantic Error: {}", e))
    }

    fn analyze_if_stmt(
        &mut self,
        condition: ast::Expr,
        then_branch: Box<ast::Stmt>,
        else_branch: Option<Box<ast::Stmt>>,
    ) -> Result<(), String> {
        let cond_type = self.analyze_expr(condition)?;

        if cond_type != symbol_table::Type::Bool {
            return Err(format!("If condition must be Bool, found {:?}", cond_type));
        }

        self.analyze_stmt(*then_branch)?;

        if let Some(else_stmt) = else_branch {
            self.analyze_stmt(*else_stmt)?;
        }

        Ok(())
    }

    fn analyze_while_stmt(
        &mut self,
        condition: ast::Expr,
        body: Box<ast::Stmt>,
    ) -> Result<(), String> {
        let cond_type = self.analyze_expr(condition)?;
        if cond_type != symbol_table::Type::Bool {
            return Err(format!(
                "While condition must be Bool, found {:?}",
                cond_type
            ));
        }
        self.analyze_stmt(*body)
    }

    fn analyze_decl(&mut self, decl: ast::Decl) -> Result<(), String> {
        match decl {
            ast::Decl::Import { path } => self.analyze_import_decl(&path),
            ast::Decl::ConstDecl {
                name,
                r#type,
                value,
                ..
            } => self.analyze_let_stmt(name, Some(r#type), false, Some(value)),
            ast::Decl::Type { name, r#type, .. } => Ok(self.analyze_type_decl(name, r#type)),
            ast::Decl::ExternFunc { name, params, return_type, .. } => {
                self.analyze_extern_func_decl(name, params, return_type)
            }
            ast::Decl::Func(func) => {
                if func.generics.is_empty() {
                    self.analyze_func_decl(func)
                } else {
                    self.generic_templates.insert(func.name.clone(), func);
                    Ok(())
                }
            }
            ast::Decl::Struct { name, fields, .. } => self.analyze_struct_decl(name, fields),
            ast::Decl::Enum { .. } => {
                eprintln!("Warning: enums not yet implemented in semantic analysis");
                Ok(())
            }
            ast::Decl::Construct { name, methods } => {
                for method in methods {
                    self.analyze_func_decl(method)?;
                }
                Ok(())
            }
            _ => Err(format!("Unknown declaration kind: {:#?}", decl)),
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

        for (nested_ns, nested_program) in module_analyzer.imported_modules.drain() {
            self.imported_modules.entry(nested_ns).or_insert(nested_program);
        }

        let module_symbols: HashMap<String, symbol_table::Symbol> = full_symbols
            .into_iter()
            .filter(|(name, _)| exported_names.contains(name))
            .collect();

        self.imported_modules.insert(namespace.clone(), full_program);

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

    fn analyze_func_decl(&mut self, func_decl: ast::FuncDecl) -> Result<(), String> {
        let name = func_decl.name;
        let mut func_params = Vec::new();

        for param in func_decl.params {
            let param_name = param.0;
            let param_type = convert_type_expr(&param.1);
            func_params.push((param_name, param_type));
        }

        let ret_type = if let Some(ty) = func_decl.return_type {
            convert_type_expr(&ty)
        } else {
            symbol_table::Type::Unit
        };

        let symbol = symbol_table::Symbol {
            name: name.clone(),
            kind: symbol_table::SymbolKind::FuncDecl {
                params: func_params.clone(),
                return_type: ret_type.clone(),
            },
        };

        if let Err(e) = self.symbols.define(&name, symbol) {
            return Err(format!("Semantic Error: {}", e));
        }

        let prev_func_block = self.curr_func_block.clone();
        self.curr_func_block = Some(CurrFuncBlock {
            current_func_name: name,
            curr_ret_type: ret_type.clone(),
        });

        self.symbols.enter_scope();

        for (p_name, p_type) in func_params {
            let param_symbol = symbol_table::Symbol {
                name: p_name.clone(),
                kind: symbol_table::SymbolKind::Variable {
                    var_type: p_type,
                    value: None,
                    mutable: false,
                },
            };
            if let Err(e) = self.symbols.define(&p_name, param_symbol) {
                return Err(format!("Semantic Error: {}", e));
            }
        }

        for stmt in func_decl.body {
            self.analyze_stmt(stmt)?;
        }

        self.symbols
            .exit_scope()
            .map_err(|e| format!("Semantic Error: {}", e))?;

        self.curr_func_block = prev_func_block;
        Ok(())
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
}
