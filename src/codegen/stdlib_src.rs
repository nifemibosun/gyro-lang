pub fn lookup(path: &str) -> Option<&'static str> {
    match path {
        "std/io" => Some(include_str!("../../stdlib/io.gyro")),
        "std/string" => Some(include_str!("../../stdlib/string.gyro")),
        "std/math" => Some(include_str!("../../stdlib/math.gyro")),
        "std/array" => Some(include_str!("../../stdlib/array.gyro")),
        _ => None,
    }
}
