fn main() {
    let cmd = "python -c \"print('Hola desde Python, orquestado por Moset')\"";
    let output = std::process::Command::new("cmd")
        .args(["/C", cmd])
        .output()
        .unwrap();
    println!("stdout: {}", String::from_utf8_lossy(&output.stdout));
    println!("stderr: {}", String::from_utf8_lossy(&output.stderr));
}
