use crate::parser::ast;
use crate::utils::convert_type_expr;

use super::Codegen;

impl<'ctx> Codegen<'ctx> {
    pub fn emit_stmt(&mut self, stmt: &ast::Stmt) {
        match &stmt.value {
            ast::StmtKind::Return(expr) => self.emit_return(expr.as_ref()),
            ast::StmtKind::Let {
                name,
                r#type,
                initializer,
                ..
            } => {
                self.emit_let(name, r#type.as_ref(), initializer.as_ref());
            }
            ast::StmtKind::ExprStmt(expr) => {
                self.emit_expr(expr);
            }
            ast::StmtKind::Assign { target, value, .. } => {
                self.emit_assign(target, value);
            }
            ast::StmtKind::Block(stmts) => {
                for s in stmts {
                    self.emit_stmt(s);
                }
            }
            ast::StmtKind::If {
                condition,
                then_branch,
                else_branch,
            } => {
                self.emit_if(condition, then_branch, else_branch.as_deref());
            }
            ast::StmtKind::While { condition, body } => {
                self.emit_while(condition, body);
            }
            ast::StmtKind::For { .. } => {
                eprintln!("Warning: 'for' loops not yet implemented, skipping");
            }
            ast::StmtKind::Match { .. } => {
                eprintln!("Warning: 'match' not yet implemented, skipping");
            }
            ast::StmtKind::ConstStmt {
                name,
                r#type,
                value,
                ..
            } => {
                self.emit_let(name, Some(r#type), Some(value));
            }
            _ => {
                eprintln!("Warning: statement not yet implemented, skipping");
            }
        }
    }

    fn emit_return(&mut self, expr: Option<&ast::Expr>) {
        match expr {
            Some(e) => {
                let val = self.emit_expr(e);
                self.builder.build_return(Some(&val)).unwrap();
            }
            None => {
                self.builder.build_return(None).unwrap();
            }
        }
    }

    fn emit_let(&mut self, name: &str, ty: Option<&ast::TypeExpr>, init: Option<&ast::Expr>) {
        let llvm_type = if let Some(type_expr) = ty {
            let sem_type = convert_type_expr(type_expr);
            self.llvm_type(&sem_type)
        } else if let Some(init_expr) = init {
            let val = self.emit_expr(init_expr);
            val.get_type()
        } else {
            eprintln!(
                "Error: 'let {}' has no type or initializer — skipping",
                name
            );
            return;
        };

        let slot = self.builder.build_alloca(llvm_type, name).unwrap();
        self.locals.insert(name.to_string(), (slot, llvm_type));

        if let Some(init_expr) = init {
            let val = self.emit_expr(init_expr);
            self.builder.build_store(slot, val).unwrap();
        }
    }

    fn emit_assign(&mut self, target: &ast::Expr, value: &ast::Expr) {
        let name = match &target.value {
            ast::ExprKind::Identifier(n) => n,
            _ => {
                eprintln!("Error: assignment target must be an identifier");
                return;
            }
        };

        let val = self.emit_expr(value);

        if let Some(&(slot, _)) = self.locals.get(name) {
            self.builder.build_store(slot, val).unwrap();
        } else {
            eprintln!("Error: assignment to undefined variable '{}'", name);
        }
    }

    fn emit_if(
        &mut self,
        condition: &ast::Expr,
        then_branch: &ast::Stmt,
        else_branch: Option<&ast::Stmt>,
    ) {
        let function = self
            .builder
            .get_insert_block()
            .unwrap()
            .get_parent()
            .unwrap();

        let then_block = self.context.append_basic_block(function, "then");
        let else_block = self.context.append_basic_block(function, "else");
        let merge_block = self.context.append_basic_block(function, "merge");

        let cond_val = self.emit_expr(condition).into_int_value();
        self.builder
            .build_conditional_branch(cond_val, then_block, else_block)
            .unwrap();

        self.builder.position_at_end(then_block);
        self.emit_stmt(then_branch);
        
        if self
            .builder
            .get_insert_block()
            .unwrap()
            .get_terminator()
            .is_none()
        {
            self.builder
                .build_unconditional_branch(merge_block)
                .unwrap();
        }

        self.builder.position_at_end(else_block);
        if let Some(else_stmt) = else_branch {
            self.emit_stmt(else_stmt);
        }
        if self
            .builder
            .get_insert_block()
            .unwrap()
            .get_terminator()
            .is_none()
        {
            self.builder
                .build_unconditional_branch(merge_block)
                .unwrap();
        }

        self.builder.position_at_end(merge_block);
    }

    fn emit_while(&mut self, condition: &ast::Expr, body: &ast::Stmt) {
        let function = self
            .builder
            .get_insert_block()
            .unwrap()
            .get_parent()
            .unwrap();

        let cond_block = self.context.append_basic_block(function, "while_cond");
        let body_block = self.context.append_basic_block(function, "while_body");
        let exit_block = self.context.append_basic_block(function, "while_exit");

        self.builder.build_unconditional_branch(cond_block).unwrap();

        self.builder.position_at_end(cond_block);
        let cond_val = self.emit_expr(condition).into_int_value();
        self.builder
            .build_conditional_branch(cond_val, body_block, exit_block)
            .unwrap();

        self.builder.position_at_end(body_block);
        self.emit_stmt(body);
        if self
            .builder
            .get_insert_block()
            .unwrap()
            .get_terminator()
            .is_none()
        {
            self.builder.build_unconditional_branch(cond_block).unwrap();
        }

        self.builder.position_at_end(exit_block);
    }
}
