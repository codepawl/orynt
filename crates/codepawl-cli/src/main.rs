fn main() {
    match codepawl_cli::run_cli(std::env::args()) {
        Ok(result) => print!("{}", result.stdout),
        Err(error) => {
            eprintln!("error: {error:#}");
            std::process::exit(2);
        }
    }
}
