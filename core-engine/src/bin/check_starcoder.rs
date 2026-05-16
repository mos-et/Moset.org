#[cfg(feature = "ai")]
fn main() {
    let mut file = std::fs::File::open("S:\\Naraka Studio\\Moset\\scripts\\moset_naraka.gguf").unwrap();
    let content = candle_core::quantized::gguf_file::Content::read(&mut file).unwrap();
    println!("Architecture: {:?}", content.metadata.get("general.architecture"));
}

#[cfg(not(feature = "ai"))]
fn main() {
    println!("This binary requires the 'ai' feature.");
}
