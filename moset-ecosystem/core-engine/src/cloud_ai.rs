use serde::{Deserialize, Serialize};
use serde_json::json;
use std::io::Read;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Mensaje {
    pub role: String,
    pub content: String,
}

pub struct MotorCloud {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub base_url: Option<String>,
}

impl MotorCloud {
    pub fn nuevo(provider: &str, model: &str, api_key: &str, base_url: Option<&str>) -> Self {
        Self {
            provider: provider.to_string(),
            model: model.to_string(),
            api_key: api_key.to_string(),
            base_url: base_url.map(|s| s.to_string()),
        }
    }

    pub fn inferir<F>(&self, system_prompt: &str, msgs: &[Mensaje], mut on_partial: F) -> Result<String, String>
    where
        F: FnMut(String) -> bool,
    {
        match self.provider.as_str() {
            "openai" => self.inferir_openai(system_prompt, msgs, on_partial),
            "anthropic" => self.inferir_anthropic(system_prompt, msgs, on_partial),
            "google" => self.inferir_google(system_prompt, msgs, on_partial),
            _ => Err(format!("Proveedor desconocido: {}", self.provider)),
        }
    }

    fn read_sse<F>(&self, response: reqwest::blocking::Response, mut on_partial: F, is_google: bool, is_anthropic: bool) -> Result<String, String>
    where
        F: FnMut(String) -> bool,
    {
        use std::io::BufRead;
        let mut final_text = String::new();
        let reader = std::io::BufReader::new(response);

        for line_res in reader.lines() {
            let line = line_res.map_err(|e| format!("Error leyendo línea SSE: {}", e))?;
            let trimmed = line.trim();

            if trimmed.starts_with("data: ") && trimmed != "data: [DONE]" {
                let json_str = &trimmed[6..]; // despues de "data: "
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(json_str) {
                    let text_chunk = if is_google {
                        val.pointer("/candidates/0/content/parts/0/text").and_then(|v| v.as_str())
                    } else if is_anthropic {
                        val.pointer("/delta/text").and_then(|v| v.as_str())
                    } else { // OpenAI by default
                        val.pointer("/choices/0/delta/content").and_then(|v| v.as_str())
                    };

                    if let Some(c) = text_chunk {
                        final_text.push_str(c);
                        if !on_partial(c.to_string()) {
                            break;
                        }
                    }
                }
            }
        }
        Ok(final_text)
    }

    fn inferir_openai<F>(&self, system_prompt: &str, msgs: &[Mensaje], on_partial: F) -> Result<String, String>
    where
        F: FnMut(String) -> bool,
    {
        let base = self.base_url.as_deref().unwrap_or("https://api.openai.com/v1");
        let url = format!("{}/chat/completions", base.trim_end_matches('/'));

        let mut all_msgs = vec![json!({
            "role": "system",
            "content": system_prompt
        })];

        for m in msgs {
            all_msgs.push(json!({
                "role": m.role,
                "content": m.content
            }));
        }

        let body = json!({
            "model": self.model,
            "messages": all_msgs,
            "stream": true,
        });

        let client = reqwest::blocking::Client::new();
        let mut builder = client.post(&url)
            .header("Content-Type", "application/json");

        if !self.api_key.is_empty() {
            builder = builder.header("Authorization", format!("Bearer {}", self.api_key));
        }

        let res = builder.json(&body)
            .send()
            .map_err(|e| format!("Error en red OpenAI: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let txt = res.text().unwrap_or_default();
            return Err(format!("OpenAI Error {}: {}", status, txt));
        }

        self.read_sse(res, on_partial, false, false)
    }

    fn inferir_anthropic<F>(&self, system_prompt: &str, msgs: &[Mensaje], on_partial: F) -> Result<String, String>
    where
        F: FnMut(String) -> bool,
    {
        let url = "https://api.anthropic.com/v1/messages";

        let body = json!({
            "model": self.model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": msgs,
            "stream": true,
        });

        let client = reqwest::blocking::Client::new();
        let builder = client.post(url)
            .header("Content-Type", "application/json")
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .json(&body);

        let res = builder.send()
            .map_err(|e| format!("Error en red Anthropic: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let txt = res.text().unwrap_or_default();
            return Err(format!("Anthropic Error {}: {}", status, txt));
        }

        self.read_sse(res, on_partial, false, true)
    }

    fn inferir_google<F>(&self, system_prompt: &str, msgs: &[Mensaje], on_partial: F) -> Result<String, String>
    where
        F: FnMut(String) -> bool,
    {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            self.model, self.api_key
        );

        let mut contents = Vec::new();
        for m in msgs {
            let role = if m.role == "assistant" { "model" } else { "user" };
            contents.push(json!({
                "role": role,
                "parts": [{"text": m.content}]
            }));
        }

        let body = json!({
            "systemInstruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": contents,
        });

        let client = reqwest::blocking::Client::new();
        let res = client.post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .map_err(|e| format!("Error en red Google: {}", e))?;

        if !res.status().is_success() {
            let status = res.status();
            let txt = res.text().unwrap_or_default();
            return Err(format!("Google Error {}: {}", status, txt));
        }

        self.read_sse(res, on_partial, true, false)
    }
}
