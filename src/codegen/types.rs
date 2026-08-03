use inkwell::types::{ BasicTypeEnum, BasicType };
use inkwell::values::BasicValueEnum;

use crate::semantic::symbol_table::Type;

use super::Codegen;

impl<'ctx> Codegen<'ctx> {
    pub fn llvm_type(&self, ty: &Type) -> BasicTypeEnum<'ctx> {
        match ty {
            Type::Int8   | Type::UInt8   => self.context.i8_type().into(),
            Type::Int16  | Type::UInt16  => self.context.i16_type().into(),
            Type::Int32  | Type::UInt32  => self.context.i32_type().into(),
            Type::Int64  | Type::UInt64  => self.context.i64_type().into(),
            Type::Int128 | Type::UInt128 => self.context.i128_type().into(),
            Type::IntN   | Type::UIntN   => self.context.i128_type().into(),

            Type::Float32 => self.context.f32_type().into(),
            Type::Float64 => self.context.f64_type().into(),

            Type::Bool => self.context.bool_type().into(),

            Type::Char => self.context.i8_type().into(),

            Type::String => self
                .context
                .ptr_type(inkwell::AddressSpace::default())
                .into(),

            Type::Struct(name) => self
                .module
                .get_struct_type(name)
                .unwrap_or_else(|| panic!("Struct '{}' not defined in module", name))
                .into(),

            Type::Array { element, size } => {
                let elem_llvm_ty = self.llvm_type(element);
                match size {
                    Some(n) => elem_llvm_ty.array_type(*n as u32).into(),
                    None => panic!(
                        "Unsized array types have no fixed LLVM representation yet — \
                         need a pointer+length (slice) design before this compiles"
                    ),
                }
            }

            Type::Unit => panic!(
                "Unit/void has no BasicTypeEnum — handle void return separately in decl.rs"
            ),
        }
    }

    pub fn coerce_to(&self, val: BasicValueEnum<'ctx>, target_ty: BasicTypeEnum<'ctx>) -> BasicValueEnum<'ctx> {
        if val.get_type() == target_ty {
            return val;
        }
        match (val, target_ty) {
            (BasicValueEnum::IntValue(iv), BasicTypeEnum::IntType(it)) => {
                let src_bits = iv.get_type().get_bit_width();
                let dst_bits = it.get_bit_width();
                if dst_bits > src_bits {
                    self.builder.build_int_s_extend(iv, it, "sext").unwrap().into()
                } else if dst_bits < src_bits {
                    self.builder.build_int_truncate(iv, it, "trunc").unwrap().into()
                } else {
                    iv.into()
                }
            }
            (BasicValueEnum::IntValue(iv), BasicTypeEnum::FloatType(ft)) => {
                self.builder.build_signed_int_to_float(iv, ft, "sitofp").unwrap().into()
            }
            (BasicValueEnum::FloatValue(fv), BasicTypeEnum::FloatType(ft)) => {
                if ft == self.context.f64_type() {
                    self.builder.build_float_ext(fv, ft, "fpext").unwrap().into()
                } else {
                    self.builder.build_float_trunc(fv, ft, "fptrunc").unwrap().into()
                }
            }
            _ => val,
        }
    }
}