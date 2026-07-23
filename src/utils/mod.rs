use crate::parser::ast;
use crate::semantic::symbol_table::Type;


pub fn convert_type_expr(type_expr: &ast::TypeExpr) -> Type {
        match type_expr {
            ast::TypeExpr::Named(ty_expr) => {
                match ty_expr.as_str() {
                    "int8"    => Type::Int8,
                    "int16"   => Type::Int16,
                    "int32"   => Type::Int32,
                    "int64"   => Type::Int64,
                    "int128"  => Type::Int128,
                    "int_n"   => Type::IntN,
                    "uint8"   => Type::UInt8,
                    "uint16"  => Type::UInt16,
                    "uint32"  => Type::UInt32,
                    "uint64"  => Type::UInt64,
                    "uint128" => Type::UInt128,
                    "uint_n"  => Type::UIntN,
                    "float32" => Type::Float32,
                    "float64" => Type::Float64,
                    "bool"    => Type::Bool,
                    "char"    => Type::Char,
                    "string"  => Type::String,
                    other => Type::Struct(other.to_string()),
                }
            }
            ast::TypeExpr::Array { size, element } => {
                let element_type = convert_type_expr(&element);

                Type::Array {
                    element: Box::new(element_type),
                    size: *size,
                }
            }
            ast::TypeExpr::Pointer { .. } => {
                eprintln!("Warning: pointer types not yet implemented in codegen");
                Type::Unit
            }
            ast::TypeExpr::Generic(_, _) => {
                eprintln!("Warning: generic types not yet implemented in codegen");
                Type::Unit
            }
        }
    }