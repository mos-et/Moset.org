// ============================================================================
// MOSET - Motor Naraka (Inferencia Local via Candle)
// ============================================================================
// Feature-gated: compilar con --features ai para activar
// Para CUDA: --features "ai,cuda"
// Modelos: Phi-3, Qwen2/3, DeepSeek-R1, Llama (auto-detect GGUF)
// ============================================================================

/// Estado del Motor Naraka
#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum EstadoMotor {
    Activo(String),
    Inactivo,
    Error(String),
}

impl std::fmt::Display for EstadoMotor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EstadoMotor::Activo(d) => write!(f, "Moset AI ACTIVO [{}]", d),
            EstadoMotor::Inactivo => write!(f, "Moset AI INACTIVO [compilar con --features ai]"),
            EstadoMotor::Error(e) => write!(f, "Moset AI ERROR: {}", e),
        }
    }
}

// === Implementacion con Candle (feature ai activada) ===

#[cfg(feature = "ai")]
mod engine {
    use super::EstadoMotor;
    use candle_core::{Device, Tensor};
    use candle_core::quantized::gguf_file;
    use candle_transformers::generation::LogitsProcessor;
    use tokenizers::Tokenizer;
    use std::path::PathBuf;

    #[derive(Debug, Clone)]
    pub enum ArquitecturaModelo {
        Phi3,
        Qwen2,
        Qwen3,
        Llama,
    }

    pub enum ModeloUnificado {
        Phi3(candle_transformers::models::quantized_phi3::ModelWeights),
        Qwen2(candle_transformers::models::quantized_qwen2::ModelWeights),
        Qwen3(candle_transformers::models::quantized_qwen3::ModelWeights),
        Llama(candle_transformers::models::quantized_llama::ModelWeights),
    }

    impl ModeloUnificado {
        pub fn forward(&mut self, input: &Tensor, pos: usize) -> candle_core::Result<Tensor> {
            match self {
                ModeloUnificado::Phi3(m) => m.forward(input, pos),
                ModeloUnificado::Qwen2(m) => m.forward(input, pos),
                ModeloUnificado::Qwen3(m) => m.forward(input, pos),
                ModeloUnificado::Llama(m) => m.forward(input, pos),
            }
        }
    }

    pub struct MotorNaraka {
        device: Device,
        device_name: String,
        tokenizer: Option<Tokenizer>,
        modelo: Option<ModeloUnificado>,
        arquitectura: Option<ArquitecturaModelo>,
        temperatura: f64,
        top_p: Option<f64>,
        top_k: Option<usize>,
        repeat_penalty: f32,
        repeat_last_n: usize,
        eos_token_id: Option<u32>,
    }

    impl MotorNaraka {
        pub fn nuevo() -> Self {
            let (device, device_name) = Self::detectar_device();
            MotorNaraka {
                device,
                device_name,
                tokenizer: None,
                modelo: None,
                arquitectura: None,
                temperatura: 0.7,
                top_p: Some(0.9),
                top_k: Some(40),
                repeat_penalty: 1.1,
                repeat_last_n: 64,
                eos_token_id: None,
            }
        }

        /// Ajusta la temperatura de muestreo (mapeo cuántico: alpha → temperatura).
        /// temperature=0.0 → determinístico (siempre el token más probable)
        /// temperature=0.7071 → probabilístico balanceado (Born Rule, α² = 0.5)
        /// temperature→1.0 → máxima creatividad / entropía
        pub fn set_temperature(&mut self, temperature: f32) {
            self.temperatura = temperature as f64;
        }

        fn detectar_device() -> (Device, String) {
            #[cfg(feature = "cuda")]
            if let Ok(dev) = Device::new_cuda(0) {
                return (dev, "CUDA:0 (NVIDIA GPU)".to_string());
            }

            #[cfg(feature = "metal")]
            if let Ok(dev) = Device::new_metal(0) {
                return (dev, "Metal (Apple GPU)".to_string());
            }

            // Candle does not have a native Device::new_vulkan equivalent in this version without deeper setup
            // so if neither cuda nor metal work, we gracefully fallback to CPU.
            (Device::Cpu, "CPU (RAM)".to_string())
        }

        pub fn estado(&self) -> EstadoMotor {
            if self.modelo.is_some() {
                let arch = self.arquitectura.as_ref()
                    .map(|a| format!("{:?}", a))
                    .unwrap_or_else(|| "N/A".into());
                EstadoMotor::Activo(
                    format!("{} | {} | modelo cargado", self.device_name, arch)
                )
            } else {
                EstadoMotor::Activo(
                    format!("{} | sin modelo", self.device_name)
                )
            }
        }

        pub fn device_info(&self) -> String {
            self.device_name.clone()
        }

        pub fn cargar_tokenizer(&mut self, ruta: &str) -> Result<(), String> {
            let tokenizer = Tokenizer::from_file(ruta)
                .map_err(|e| format!("Error cargando tokenizer '{}': {}", ruta, e))?;
            // Detectar EOS token
            let eos = tokenizer.token_to_id("</s>")
                .or_else(|| tokenizer.token_to_id("<|endoftext|>"))
                .or_else(|| tokenizer.token_to_id("<|end|>"))
                .or_else(|| tokenizer.token_to_id("<|im_end|>"))
                .unwrap_or(2);
            self.eos_token_id = Some(eos);
            self.tokenizer = Some(tokenizer);
            Ok(())
        }

        pub fn cargar_gguf(&mut self, ruta: &str) -> Result<String, String> {
            // IMPORTANTE: Limpiamos explícitamente el modelo anterior de la RAM/VRAM
            // antes de cargar uno nuevo para evitar picos de memoria (OOM).
            self.modelo = None;
            self.arquitectura = None;

            let path = PathBuf::from(ruta);
            if !path.exists() {
                return Err(format!("Archivo no encontrado: {}", ruta));
            }

            let mut file = std::fs::File::open(&path)
                .map_err(|e| format!("Error abriendo GGUF: {}", e))?;

            let content = gguf_file::Content::read(&mut file)
                .map_err(|e| format!("Error leyendo GGUF: {}", e))?;

            let arch = Self::detectar_arquitectura(&content);
            let arch_str = format!("{:?}", arch);

            let modelo = match &arch {
                ArquitecturaModelo::Phi3 => {
                    let w = candle_transformers::models::quantized_phi3::ModelWeights::from_gguf(
                        false, content, &mut file, &self.device
                    ).map_err(|e| format!("Error Phi3: {}", e))?;
                    ModeloUnificado::Phi3(w)
                }
                ArquitecturaModelo::Qwen2 => {
                    let w = candle_transformers::models::quantized_qwen2::ModelWeights::from_gguf(
                        content, &mut file, &self.device
                    ).map_err(|e| format!("Error Qwen2: {}", e))?;
                    ModeloUnificado::Qwen2(w)
                }
                ArquitecturaModelo::Qwen3 => {
                    let w = candle_transformers::models::quantized_qwen3::ModelWeights::from_gguf(
                        content, &mut file, &self.device
                    ).map_err(|e| format!("Error Qwen3: {}", e))?;
                    ModeloUnificado::Qwen3(w)
                }
                ArquitecturaModelo::Llama => {
                    let w = candle_transformers::models::quantized_llama::ModelWeights::from_gguf(
                        content, &mut file, &self.device
                    ).map_err(|e| format!("Error Llama: {}", e))?;
                    ModeloUnificado::Llama(w)
                }
            };

            self.modelo = Some(modelo);
            self.arquitectura = Some(arch);

            let file_size = std::fs::metadata(ruta)
                .map(|m| m.len() / (1024 * 1024))
                .unwrap_or(0);
            let fname = ruta.rsplit(|c| c == '/' || c == '\\')
                .next().unwrap_or(ruta);

            Ok(format!(
                "Modelo cargado: {} ({} MB) arch={} device=[{}]",
                fname, file_size, arch_str, self.device_name
            ))
        }

        fn detectar_arquitectura(content: &gguf_file::Content) -> ArquitecturaModelo {
            // Log all metadata keys for debugging
            #[cfg(debug_assertions)]
            eprintln!("[naraka] Metadata keys: {:?}", content.metadata.keys().collect::<Vec<_>>());

            if let Some(arch_val) = content.metadata.get("general.architecture") {
                let s = format!("{:?}", arch_val).to_lowercase();
                #[cfg(debug_assertions)]
                eprintln!("[naraka] general.architecture = {}", s);

                // Phi-3 family
                if s.contains("phi3") || s.contains("phi-3") || s.contains("phi") {
                    return ArquitecturaModelo::Phi3;
                }
                // Qwen3 (must check before qwen2)
                if s.contains("qwen3") {
                    if content.metadata.contains_key("qwen3.attention.head_count") {
                        return ArquitecturaModelo::Qwen3;
                    } else {
                        #[cfg(debug_assertions)]
                        eprintln!("[naraka] WARN: Architecture '{}' detected but qwen3.attention.head_count missing, trying Qwen2 fallback", s);
                        return ArquitecturaModelo::Qwen2;
                    }
                }
                // Qwen2 / Qwen
                if s.contains("qwen2") || s.contains("qwen") {
                    return ArquitecturaModelo::Qwen2;
                }
                // Explicit llama-family check: verify required metadata exists
                if s.contains("llama") || s.contains("mistral") || s.contains("deepseek")
                   || s.contains("gemma") || s.contains("starcoder") || s.contains("codellama") {
                    // Validate that llama-specific keys exist before committing
                    if content.metadata.contains_key("llama.attention.head_count") {
                        return ArquitecturaModelo::Llama;
                    } else {
                        #[cfg(debug_assertions)]
                        eprintln!("[naraka] WARN: Architecture '{}' detected but llama.attention.head_count missing, trying Qwen2 fallback", s);
                        // Some models report as "llama" but use a Qwen-compatible layout
                        // Try Qwen2 as it has more lenient metadata requirements
                        return ArquitecturaModelo::Qwen2;
                    }
                }
            }
            // Ultimate fallback: try Llama if head_count exists, else Qwen2
            if content.metadata.contains_key("llama.attention.head_count") {
                ArquitecturaModelo::Llama
            } else {
                #[cfg(debug_assertions)]
                eprintln!("[naraka] WARN: No architecture detected and no llama metadata, defaulting to Qwen2");
                ArquitecturaModelo::Qwen2
            }
        }

        /// Aplica filtros de Top-K y Repetition Penalty sobre los logits antes del sampling.
        /// 
        /// **Top-K**: Conserva solo los K tokens con mayor logit; los demás → -∞.
        /// **Repetition Penalty**: Divide los logits de tokens ya generados por `repeat_penalty`.
        fn aplicar_filtros(
            logits: &Tensor,
            tokens_previos: &[u32],
            top_k: Option<usize>,
            repeat_penalty: f32,
            repeat_last_n: usize,
            device: &Device,
        ) -> Result<Tensor, String> {
            let mut logits_vec: Vec<f32> = logits.to_vec1()
                .map_err(|e| format!("Error extrayendo logits: {}", e))?;
            let vocab_size = logits_vec.len();

            // ─── Repetition Penalty ─────────────────────────────────────
            if repeat_penalty != 1.0 && !tokens_previos.is_empty() {
                let start = if tokens_previos.len() > repeat_last_n {
                    tokens_previos.len() - repeat_last_n
                } else {
                    0
                };
                for &token_id in &tokens_previos[start..] {
                    let idx = token_id as usize;
                    if idx < vocab_size {
                        if logits_vec[idx] > 0.0 {
                            logits_vec[idx] /= repeat_penalty;
                        } else {
                            logits_vec[idx] *= repeat_penalty;
                        }
                    }
                }
            }

            // ─── Top-K Filtering ────────────────────────────────────────
            if let Some(k) = top_k {
                if k < vocab_size {
                    let mut sorted = logits_vec.clone();
                    sorted.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
                    let threshold = sorted[k];
                    for logit in logits_vec.iter_mut() {
                        if *logit < threshold {
                            *logit = f32::NEG_INFINITY;
                        }
                    }
                }
            }

            Tensor::from_vec(logits_vec, logits.shape(), device)
                .map_err(|e| format!("Error reconstruyendo tensor: {}", e))
        }

        pub fn inferir<F>(&mut self, prompt: &str, max_tokens: usize, mut on_partial: F) -> Result<(String, usize, usize), String>
        where
            F: FnMut(String) -> bool,
        {
            // Capturar parámetros de filtrado por valor antes de los borrows mutables
            let filter_top_k = self.top_k;
            let filter_repeat_penalty = self.repeat_penalty;
            let filter_repeat_last_n = self.repeat_last_n;
            let filter_device = self.device.clone();

            let tokenizer = self.tokenizer.as_ref()
                .ok_or_else(|| "Tokenizer no cargado. Usa naraka_cargar() primero.".to_string())?;
            let modelo = self.modelo.as_mut()
                .ok_or_else(|| "Modelo no cargado. Usa naraka_cargar() primero.".to_string())?;

            let encoding = tokenizer.encode(prompt, true)
                .map_err(|e| format!("Error tokenizando: {}", e))?;
            let prompt_tokens = encoding.get_ids().to_vec();
            let prompt_len = prompt_tokens.len();

            if prompt_len == 0 {
                return Err("Prompt vacio".into());
            }

            let mut logits_proc = LogitsProcessor::new(42, Some(self.temperatura), self.top_p);
            let mut all_tokens = prompt_tokens.clone();
            let mut generated = Vec::new();
            let mut sent_len = 0;

            // Forward del prompt completo
            let input = Tensor::new(prompt_tokens.as_slice(), &self.device)
                .map_err(|e| format!("Error tensor: {}", e))?
                .unsqueeze(0)
                .map_err(|e| format!("Error unsqueeze: {}", e))?;

            let logits = modelo.forward(&input, 0)
                .map_err(|e| format!("Error forward: {}", e))?;

            let logits = logits.squeeze(0)
                .map_err(|e| format!("Error squeeze: {}", e))?;

            let mut next_token = {
                let logits_final = Self::aplicar_filtros(&logits, &all_tokens, filter_top_k, filter_repeat_penalty, filter_repeat_last_n, &filter_device)?;
                logits_proc.sample(&logits_final)
                    .map_err(|e| format!("Error sampling: {}", e))?
            };

            all_tokens.push(next_token);
            generated.push(next_token);

            if let Ok(partial) = tokenizer.decode(&generated, true) {
                if partial.len() > sent_len && !partial.ends_with('\u{FFFD}') && partial.is_char_boundary(sent_len) {
                    if !on_partial(partial[sent_len..].to_string()) {
                        return Ok((tokenizer.decode(&generated, true).unwrap_or_default(), prompt_len, generated.len()));
                    }
                    sent_len = partial.len();
                }
            }

            // Generacion autoregresiva token por token
            for i in 1..max_tokens {
                if Some(next_token) == self.eos_token_id {
                    break;
                }

                let input = Tensor::new(&[next_token], &self.device)
                    .map_err(|e| format!("Error tensor gen: {}", e))?
                    .unsqueeze(0)
                    .map_err(|e| format!("Error unsqueeze gen: {}", e))?;

                let logits = modelo.forward(&input, prompt_len + i)
                    .map_err(|e| format!("Error forward gen: {}", e))?;

                let logits = logits.squeeze(0)
                    .map_err(|e| format!("Error squeeze gen: {}", e))?;

                next_token = {
                    let logits_final = Self::aplicar_filtros(&logits, &all_tokens, filter_top_k, filter_repeat_penalty, filter_repeat_last_n, &filter_device)?;
                    logits_proc.sample(&logits_final)
                        .map_err(|e| format!("Error sampling gen: {}", e))?
                };

                if Some(next_token) == self.eos_token_id {
                    break;
                }

                all_tokens.push(next_token);
                generated.push(next_token);

                let mut should_stop = false;
                if let Ok(partial) = tokenizer.decode(&generated, true) {
                    let stops: &[&str] = &[
                        "<|end|>",           // Phi3
                        "</s>",              // Llama
                        "<|user|>",          // role switch
                        "<|im_end|>",        // Qwen2 ChatML
                        "<|im_start|>",      // Qwen role boundary
                        "<|endoftext|>",     // Qwen3 / GPT-style
                        "<|eot_id|>",        // Llama3-style
                        "User:",             // text-based role switch
                        "\nuser\n",          // plain text role switch
                        // -- Prevención de alucinaciones ChatML/Llama3/Generic --
                        "im_end>",           // Partial ChatML leak
                        "|im_start>",        // Partial ChatML leak
                        "<human>",           // Generic instruction format leak
                        "<|start_header_id|>", // Llama 3 format leak
                    ];
                    for stop in stops.iter() {
                        if let Some(pos) = partial.find(stop) {
                            should_stop = true;
                            // Clean up the stop token from the final output before breaking
                            // We only care about the text BEFORE the stop token
                            let clean = partial[..pos].to_string();
                            if clean.len() > sent_len && clean.is_char_boundary(sent_len) {
                                let _ = on_partial(clean[sent_len..].to_string());
                            }
                            break;
                        }
                    }

                    if should_stop {
                        break;
                    }

                    if partial.len() > sent_len && !partial.ends_with('\u{FFFD}') && partial.is_char_boundary(sent_len) {
                        if !on_partial(partial[sent_len..].to_string()) {
                            break;
                        }
                        sent_len = partial.len();
                    }
                }
            }

            let result = tokenizer.decode(&generated, true)
                .map_err(|e| format!("Error decodificando: {}", e))?;

            // Clean residual stop/role tags from the final output
            let clean_tags = ["<|im_end|>", "<|im_start|>", "<|end|>",
                              "<|endoftext|>", "<|eot_id|>", "</s>",
                              "im_end>", "|im_start>", "<human>", "<|start_header_id|>"];
            let mut cleaned = result;
            for tag in clean_tags.iter() {
                cleaned = cleaned.replace(tag, "");
            }
            let cleaned = cleaned.trim().to_string();

            Ok((cleaned, prompt_len, generated.len()))
        }

        pub fn diagnostico(&self) -> String {
            let mut info = String::new();
            info.push_str(&format!("Device: {}\n", self.device_name));
            info.push_str(&format!("Temperatura: {}\n", self.temperatura));
            info.push_str(&format!("Modelo: {}\n",
                if self.modelo.is_some() {
                    format!("Cargado ({:?})", self.arquitectura.as_ref().unwrap())
                } else {
                    "No cargado".into()
                }
            ));
            info.push_str(&format!("Tokenizer: {}\n",
                if self.tokenizer.is_some() { "Cargado" } else { "No cargado" }
            ));
            info.push_str(&format!("Top-K: {:?}\n", self.top_k));
            info.push_str(&format!("Repeat Penalty: {} (last {} tokens)\n", self.repeat_penalty, self.repeat_last_n));
            info.push_str(&format!("EOS Token ID: {:?}", self.eos_token_id));
            info
        }

        /// Libera modelo, tokenizer y pesos de RAM/VRAM
        pub fn descargar(&mut self) {
            self.modelo = None;
            self.tokenizer = None;
            self.arquitectura = None;
            self.eos_token_id = None;
        }

        pub fn set_temperatura(&mut self, temp: f64) {
            self.temperatura = temp.clamp(0.0, 2.0);
        }

        pub fn set_top_k(&mut self, k: Option<usize>) {
            self.top_k = k;
        }

        pub fn set_repeat_penalty(&mut self, penalty: f32, last_n: usize) {
            self.repeat_penalty = penalty.max(1.0);
            self.repeat_last_n = last_n.max(1);
        }
    }
}

// === Stub inactivo (sin feature ai) ===

#[cfg(not(feature = "ai"))]
mod engine {
    use super::EstadoMotor;

    pub struct MotorNaraka;

    #[allow(dead_code)]
    impl MotorNaraka {
        pub fn nuevo() -> Self { MotorNaraka }
        pub fn estado(&self) -> EstadoMotor { EstadoMotor::Inactivo }
        pub fn device_info(&self) -> String { "N/A (sin feature ai)".into() }
        pub fn cargar_tokenizer(&mut self, _ruta: &str) -> Result<(), String> {
            Err("Motor IA no disponible. Compilar con --features ai".into())
        }
        pub fn cargar_gguf(&mut self, _ruta: &str) -> Result<String, String> {
            Err("Motor IA no disponible. Compilar con --features ai".into())
        }
        pub fn inferir<F>(&mut self, _prompt: &str, _max_tokens: usize, _on_partial: F) -> Result<(String, usize, usize), String>
        where F: FnMut(String) -> bool {
            Err("Motor IA no disponible. Compilar con --features ai".into())
        }
        pub fn diagnostico(&self) -> String {
            "Motor naraka INACTIVO. Compilar con: cargo build --features ai".into()
        }
        pub fn descargar(&mut self) {}
        pub fn set_temperatura(&mut self, _temp: f64) {}
        pub fn set_temperature(&mut self, _temp: f32) {}
        pub fn set_top_k(&mut self, _k: Option<usize>) {}
        pub fn set_repeat_penalty(&mut self, _penalty: f32, _last_n: usize) {}
    }
}

// === API Publica ===
#[allow(unused_imports)]
pub use engine::*;


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_motor_se_crea() {
        let motor = MotorNaraka::nuevo();
        let estado = motor.estado();
        match estado {
            EstadoMotor::Inactivo | EstadoMotor::Activo(_) => {},
            _ => panic!("Estado inesperado"),
        }
    }

    #[test]
    fn test_diagnostico_no_crash() {
        let motor = MotorNaraka::nuevo();
        let diag = motor.diagnostico();
        assert!(!diag.is_empty());
    }

    #[test]
    fn test_device_info() {
        let motor = MotorNaraka::nuevo();
        let info = motor.device_info();
        assert!(!info.is_empty());
    }
}
