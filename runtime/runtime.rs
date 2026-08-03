use std::ffi::CStr;
use std::io::Write;
use std::os::raw::c_char;

/// Shared by every gyro_print_* function below. Each extern "C" wrapper is a
/// monomorphized instantiation of this — the C ABI has no generics, so this
/// is where the "generic" part actually lives, on the Rust side only.
fn print_value<T: std::fmt::Display>(value: T) {
    let stdout = std::io::stdout();
    let mut handle = stdout.lock();
    let _ = writeln!(handle, "{}", value);
    let _ = handle.flush();
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__string(s: *const c_char) {
    if s.is_null() {
        return;
    }
    let c_str = unsafe { CStr::from_ptr(s) };
    if let Ok(rust_str) = c_str.to_str() {
        print_value(rust_str);
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__int64(x: i64) {
    print_value(x);
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__float64(x: f64) {
    print_value(x);
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__bool(x: bool) {
    print_value(x);
}

#[unsafe(no_mangle)]
pub extern "C" fn gyro_print__char(x: u8) {
    print_value(x as char);
}