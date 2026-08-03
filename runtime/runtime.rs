use std::ffi::CStr;
use std::io::Write;
use std::os::raw::c_char;

fn print_value<T: std::fmt::Display>(value: T) {
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", value);
    let _ = handle.flush();
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__string(s: *const c_char) {
    if s.is_null() { return; }
    let c_str = unsafe { CStr::from_ptr(s) };
    if let Ok(rust_str) = c_str.to_str() {
        print_value(rust_str);
    }
}

#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int8(x: i8)     { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int16(x: i16)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int32(x: i32)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int64(x: i64)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int128(x: i128) { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__int_n(x: isize) { print_value(x); }

#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint8(x: u8)     { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint16(x: u16)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint32(x: u32)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint64(x: u64)   { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint128(x: u128) { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__uint_n(x: usize) { print_value(x); }

#[unsafe(no_mangle)] pub extern "C" fn gyro_print__float32(x: f32) { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__float64(x: f64) { print_value(x); }

#[unsafe(no_mangle)] pub extern "C" fn gyro_print__bool(x: bool) { print_value(x); }
#[unsafe(no_mangle)] pub extern "C" fn gyro_print__char(x: u8)   { print_value(x as char); }