#!/usr/bin/env python3
"""
Convierte un modelo GPT-2 fine-tuneado (HuggingFace) a formato GGUF
para uso nativo en el Motor Naraka de Moset IDE.

Uso: python convert_to_gguf.py
"""
import os
import sys
import json
import struct
import numpy as np

def convert_gpt2_to_gguf(model_dir: str, output_path: str):
    """Convierte modelo GPT-2 de HuggingFace safetensors a GGUF f16"""
    try:
        from safetensors import safe_open
    except ImportError:
        print("Instalando safetensors...")
        os.system(f"{sys.executable} -m pip install safetensors")
        from safetensors import safe_open
    
    import gguf
    
    # Cargar config
    config_path = os.path.join(model_dir, "config.json")
    with open(config_path, "r") as f:
        config = json.load(f)
    
    print(f"Modelo: {config.get('model_type', 'gpt2')}")
    print(f"  Vocab: {config['vocab_size']}")
    print(f"  Layers: {config['n_layer']}")
    print(f"  Heads: {config['n_head']}")
    print(f"  Embed dim: {config['n_embd']}")
    print(f"  Context: {config['n_ctx']}")
    
    # Encontrar archivo de pesos
    safetensors_files = [f for f in os.listdir(model_dir) if f.endswith('.safetensors')]
    if not safetensors_files:
        print("ERROR: No se encontraron archivos .safetensors")
        return False
    
    # Cargar pesos
    weights = {}
    for sf_file in safetensors_files:
        sf_path = os.path.join(model_dir, sf_file)
        with safe_open(sf_path, framework="numpy") as f:
            for key in f.keys():
                weights[key] = f.get_tensor(key)
    
    print(f"  Tensores cargados: {len(weights)}")
    
    # Crear GGUF
    writer = gguf.GGUFWriter(output_path, "gpt2")
    
    # Metadata
    writer.add_name("moset-naraka-v1")
    writer.add_description("Modelo Naraka fine-tuneado para el lenguaje Moset")
    writer.add_file_type(gguf.GGMLQuantizationType.F16)
    
    # Arquitectura
    writer.add_context_length(config["n_ctx"])
    writer.add_embedding_length(config["n_embd"])
    writer.add_block_count(config["n_layer"])
    writer.add_head_count(config["n_head"])
    writer.add_vocab_size(config["vocab_size"])
    writer.add_layer_norm_eps(config.get("layer_norm_epsilon", 1e-5))
    
    # Tokenizer - cargar desde el directorio del modelo
    tokenizer_path = os.path.join(model_dir, "tokenizer.json")
    if os.path.exists(tokenizer_path):
        with open(tokenizer_path, "r", encoding="utf-8") as f:
            tokenizer_data = json.load(f)
        
        # Extraer vocab
        vocab = tokenizer_data.get("model", {}).get("vocab", {})
        if vocab:
            tokens = [""] * len(vocab)
            scores = [0.0] * len(vocab)
            token_types = [gguf.TokenType.NORMAL] * len(vocab)
            
            for token, idx in vocab.items():
                if idx < len(tokens):
                    tokens[idx] = token.encode("utf-8", errors="replace")
                    scores[idx] = -float(idx)  # Frecuencia inversa como score
            
            writer.add_tokenizer_model("gpt2")
            writer.add_token_list(tokens)
            writer.add_token_scores(scores)
            writer.add_token_types(token_types)
            print(f"  Tokenizer: {len(vocab)} tokens")
    
    # Mapear nombres de tensores GPT-2 → GGUF
    tensor_map = {
        "transformer.wte.weight": "token_embd.weight",
        "transformer.wpe.weight": "position_embd.weight",
        "transformer.ln_f.weight": "output_norm.weight",
        "transformer.ln_f.bias": "output_norm.bias",
        "lm_head.weight": "output.weight",
    }
    
    for i in range(config["n_layer"]):
        prefix = f"transformer.h.{i}"
        tensor_map.update({
            f"{prefix}.ln_1.weight": f"blk.{i}.attn_norm.weight",
            f"{prefix}.ln_1.bias": f"blk.{i}.attn_norm.bias",
            f"{prefix}.attn.c_attn.weight": f"blk.{i}.attn_qkv.weight",
            f"{prefix}.attn.c_attn.bias": f"blk.{i}.attn_qkv.bias",
            f"{prefix}.attn.c_proj.weight": f"blk.{i}.attn_output.weight",
            f"{prefix}.attn.c_proj.bias": f"blk.{i}.attn_output.bias",
            f"{prefix}.ln_2.weight": f"blk.{i}.ffn_norm.weight",
            f"{prefix}.ln_2.bias": f"blk.{i}.ffn_norm.bias",
            f"{prefix}.mlp.c_fc.weight": f"blk.{i}.ffn_up.weight",
            f"{prefix}.mlp.c_fc.bias": f"blk.{i}.ffn_up.bias",
            f"{prefix}.mlp.c_proj.weight": f"blk.{i}.ffn_down.weight",
            f"{prefix}.mlp.c_proj.bias": f"blk.{i}.ffn_down.bias",
        })
    
    # Escribir tensores
    written = 0
    for hf_name, tensor in weights.items():
        gguf_name = tensor_map.get(hf_name)
        if gguf_name is None:
            print(f"  ⚠ Tensor no mapeado: {hf_name}")
            continue
        
        # Convertir a f16 para los tensores grandes (no biases ni norms)
        if tensor.ndim >= 2 and tensor.size > 256:
            data = tensor.astype(np.float16)
            data_type = gguf.GGMLQuantizationType.F16
        else:
            data = tensor.astype(np.float32)
            data_type = gguf.GGMLQuantizationType.F32
        
        # Para GPT-2, c_attn y c_fc tienen los pesos transpuestos (Conv1D)
        if "c_attn" in hf_name or "c_fc" in hf_name or "c_proj" in hf_name:
            if tensor.ndim == 2:
                data = np.ascontiguousarray(data.T)
        
        writer.add_tensor(gguf_name, data, raw_dtype=data_type)
        written += 1
    
    print(f"  Tensores escritos: {written}")
    
    # Finalizar
    writer.write_header_to_file()
    writer.write_kv_data_to_file()
    writer.write_tensors_to_file()
    writer.close()
    
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\n[OK] GGUF generado: {output_path}")
    print(f"   Tamaño: {size_mb:.1f} MB")
    return True


if __name__ == "__main__":
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_dir = os.path.join(script_dir, "fine_tuned_moset_model")
    output_path = os.path.join(script_dir, "moset_naraka.gguf")
    
    if not os.path.exists(model_dir):
        print(f"ERROR: No se encontró el directorio del modelo: {model_dir}")
        print("Ejecutar primero: python fine_tune_naraka.py")
        sys.exit(1)
    
    success = convert_gpt2_to_gguf(model_dir, output_path)
    sys.exit(0 if success else 1)
