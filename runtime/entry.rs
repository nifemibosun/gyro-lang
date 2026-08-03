unsafe extern "C" {
    fn gyro_main();
}

fn main() {
    unsafe {
        gyro_main();
    }
}