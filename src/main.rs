pub mod codegen;
pub mod gyro;
pub mod semantic;
pub mod utils;
pub mod parser;
pub mod scanner;


fn main() {
    gyro::run();
}
