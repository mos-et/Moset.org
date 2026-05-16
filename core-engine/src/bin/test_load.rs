use moset_core::ai::MotorNaraka;

fn main() {
    let mut motor = MotorNaraka::nuevo();
    let modelo_path = "S:\\Naraka Studio\\Moset\\scripts\\moset_naraka.gguf";
    
    // Check if tokenizer exists
    let tok_path = "S:\\Naraka Studio\\Moset\\scripts\\tokenizer.json";
    if std::path::Path::new(tok_path).exists() {
        println!("Cargando tokenizer...");
        if let Err(e) = motor.cargar_tokenizer(tok_path) {
            println!("Error al cargar tokenizer: {}", e);
        }
    } else {
        println!("No se encontró tokenizer.json, probando sin él...");
    }

    println!("Cargando modelo...");
    match motor.cargar_gguf(modelo_path) {
        Ok(msg) => println!("EXITO: {}", msg),
        Err(e) => println!("ERROR: {}", e),
    }
}
