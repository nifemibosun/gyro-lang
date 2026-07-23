use inkwell::values::BasicValueEnum;
use inkwell::IntPredicate;
use inkwell::FloatPredicate;

use crate::parser::ast;
use crate::scanner::token::{LiteralTypes, TokenType};

use super::Codegen;

impl<'ctx> Codegen<'ctx> {
    pub fn emit_expr(&mut self, expr: &ast::Expr) -> BasicValueEnum<'ctx> {
        match &expr.value {
            ast::ExprKind::Literal(lit)              => self.emit_literal(lit),
            ast::ExprKind::Identifier(name)          => self.emit_identifier(name),
            ast::ExprKind::Binary { left, op, right } => self.emit_binary(left, op, right),
            ast::ExprKind::Unary { op, right }        => self.emit_unary(op, right),
            ast::ExprKind::Call { callee, arguments } => self.emit_call(callee, arguments),
            ast::ExprKind::Grouping(inner)            => self.emit_expr(inner),
            ast::ExprKind::Member { .. } => {
                eprintln!("Warning: member access not yet implemented");
                self.context.i32_type().const_int(0, false).into()
            }
            ast::ExprKind::Index { .. } => {
                eprintln!("Warning: index expression not yet implemented");
                self.context.i32_type().const_int(0, false).into()
            }
            _ => {
                eprintln!("Warning: expression not yet implemented");
                self.context.i32_type().const_int(0, false).into()
            }
        }
    }

    fn emit_literal(&self, lit: &LiteralTypes) -> BasicValueEnum<'ctx> {
        match lit {
            LiteralTypes::Int(n) => self
                .context
                .i32_type()
                .const_int(*n as u64, true) 
                .into(),

            LiteralTypes::Float(f) => self
                .context
                .f64_type()
                .const_float(*f)
                .into(),

            LiteralTypes::Bool(b) => self
                .context
                .bool_type()
                .const_int(*b as u64, false)
                .into(),

            LiteralTypes::Char(c) => self
                .context
                .i8_type()
                .const_int(*c as u64, false)
                .into(),

            LiteralTypes::String(s) => {
                self.builder
                    .build_global_string_ptr(s, "str")
                    .unwrap()
                    .as_pointer_value()
                    .into()
            }
        }
    }

    fn emit_identifier(&self, name: &str) -> BasicValueEnum<'ctx> {
        if let Some(&(slot, ty)) = self.locals.get(name) {
            self.builder.build_load(ty, slot, name).unwrap()
        } else {
            eprintln!("Error: undefined variable '{}' in codegen", name);
            self.context.i32_type().const_int(0, false).into()
        }
    }

    fn emit_binary(
        &mut self,
        left: &ast::Expr,
        op: &TokenType,
        right: &ast::Expr,
    ) -> BasicValueEnum<'ctx> {
        let lhs = self.emit_expr(left);
        let rhs = self.emit_expr(right);

        let is_int   = lhs.is_int_value();

        match op {
            TokenType::Plus => {
                if is_int {
                    self.builder.build_int_add(
                        lhs.into_int_value(), rhs.into_int_value(), "add"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_add(
                        lhs.into_float_value(), rhs.into_float_value(), "fadd"
                    ).unwrap().into()
                }
            }
            TokenType::Minus => {
                if is_int {
                    self.builder.build_int_sub(
                        lhs.into_int_value(), rhs.into_int_value(), "sub"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_sub(
                        lhs.into_float_value(), rhs.into_float_value(), "fsub"
                    ).unwrap().into()
                }
            }
            TokenType::Star => {
                if is_int {
                    self.builder.build_int_mul(
                        lhs.into_int_value(), rhs.into_int_value(), "mul"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_mul(
                        lhs.into_float_value(), rhs.into_float_value(), "fmul"
                    ).unwrap().into()
                }
            }
            TokenType::Slash => {
                if is_int {
                    self.builder.build_int_signed_div(
                        lhs.into_int_value(), rhs.into_int_value(), "div"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_div(
                        lhs.into_float_value(), rhs.into_float_value(), "fdiv"
                    ).unwrap().into()
                }
            }
            TokenType::Mod => {
                if is_int {
                    self.builder.build_int_signed_rem(
                        lhs.into_int_value(), rhs.into_int_value(), "rem"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_rem(
                        lhs.into_float_value(), rhs.into_float_value(), "frem"
                    ).unwrap().into()
                }
            }

            TokenType::EqualEqual => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::EQ,
                        lhs.into_int_value(), rhs.into_int_value(), "eq"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::OEQ,
                        lhs.into_float_value(), rhs.into_float_value(), "feq"
                    ).unwrap().into()
                }
            }
            TokenType::BangEqual => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::NE,
                        lhs.into_int_value(), rhs.into_int_value(), "ne"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::ONE,
                        lhs.into_float_value(), rhs.into_float_value(), "fne"
                    ).unwrap().into()
                }
            }
            TokenType::Greater => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::SGT,
                        lhs.into_int_value(), rhs.into_int_value(), "gt"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::OGT,
                        lhs.into_float_value(), rhs.into_float_value(), "fgt"
                    ).unwrap().into()
                }
            }
            TokenType::GreaterEqual => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::SGE,
                        lhs.into_int_value(), rhs.into_int_value(), "ge"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::OGE,
                        lhs.into_float_value(), rhs.into_float_value(), "fge"
                    ).unwrap().into()
                }
            }
            TokenType::Less => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::SLT,
                        lhs.into_int_value(), rhs.into_int_value(), "lt"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::OLT,
                        lhs.into_float_value(), rhs.into_float_value(), "flt"
                    ).unwrap().into()
                }
            }
            TokenType::LessEqual => {
                if is_int {
                    self.builder.build_int_compare(
                        IntPredicate::SLE,
                        lhs.into_int_value(), rhs.into_int_value(), "le"
                    ).unwrap().into()
                } else {
                    self.builder.build_float_compare(
                        FloatPredicate::OLE,
                        lhs.into_float_value(), rhs.into_float_value(), "fle"
                    ).unwrap().into()
                }
            }

            TokenType::And => {
                self.builder.build_and(
                    lhs.into_int_value(), rhs.into_int_value(), "and"
                ).unwrap().into()
            }
            TokenType::Or => {
                self.builder.build_or(
                    lhs.into_int_value(), rhs.into_int_value(), "or"
                ).unwrap().into()
            }

            _ => {
                eprintln!("Warning: operator {:?} not yet implemented, returning 0", op);
                self.context.i32_type().const_int(0, false).into()
            }
        }
    }

    fn emit_unary(&mut self, op: &TokenType, right: &ast::Expr) -> BasicValueEnum<'ctx> {
        let val = self.emit_expr(right);

        match op {
            TokenType::Minus => {
                if val.is_int_value() {
                    self.builder
                        .build_int_neg(val.into_int_value(), "neg")
                        .unwrap()
                        .into()
                } else {
                    self.builder
                        .build_float_neg(val.into_float_value(), "fneg")
                        .unwrap()
                        .into()
                }
            }
            TokenType::Bang => {
                self.builder
                    .build_not(val.into_int_value(), "not")
                    .unwrap()
                    .into()
            }
            _ => {
                eprintln!("Warning: unary operator {:?} not yet implemented", op);
                val
            }
        }
    }

    fn emit_call(
        &mut self,
        callee: &ast::Expr,
        arguments: &[ast::Expr],
    ) -> BasicValueEnum<'ctx> {
        match &callee.value {
            ast::ExprKind::Identifier(name) => self.emit_named_call(name, arguments),

            ast::ExprKind::Member { object, field } => {
                let module_name = match &object.value {
                    ast::ExprKind::Identifier(name) => name.clone(),
                    _ => {
                        eprintln!("Error: only 'module.function(...)' calls are supported");
                        return self.context.i32_type().const_int(0, false).into();
                    }
                };

                let mangled = format!("{}_{}", module_name, field);
                self.emit_named_call(&mangled, arguments)
            }

            _ => {
                eprintln!("Error: callee must be an identifier or module member");
                self.context.i32_type().const_int(0, false).into()
            }
        }
    }

    fn emit_named_call(&mut self, func_name: &str, arguments: &[ast::Expr]) -> BasicValueEnum<'ctx> {
        let function = match self.module.get_function(func_name) {
            Some(f) => f,
            None => {
                eprintln!("Error: undefined function '{}'", func_name);
                return self.context.i32_type().const_int(0, false).into();
            }
        };

        let return_type = function.get_type().get_return_type();

        let args: Vec<_> = arguments.iter().map(|arg| self.emit_expr(arg).into()).collect();
        let call = self.builder.build_call(function, &args, "call").unwrap();

        match return_type {
            None => self.context.i32_type().const_int(0, false).into(),
            Some(_) => {
                use inkwell::values::AnyValue;
                let any = call.as_any_value_enum();
                BasicValueEnum::try_from(any)
                    .unwrap_or_else(|_| self.context.i32_type().const_int(0, false).into())
            }
        }
    }
}