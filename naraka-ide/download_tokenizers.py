import os
import time
from huggingface_hub import hf_hub_download

# user token provided
HF_TOKEN = "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"
BASE_DIR = r"S:\Data Strix\Modelos LM Studio"

MAPPING = {
    "GLM-4.6V-Flash": "THUDM/glm-4-9b-chat",
    "GLM-4.7-Flash": "THUDM/glm-4-9b-chat",
    "Granite-3.0-2B-Instruct": "ibm-granite/granite-3.0-2b-instruct",
    "OpenAI-20B-NEO-CodePlus": "EleutherAI/gpt-neox-20b",
    "Qwen-3.5-4B-Uncensored-Aggressive": "Qwen/Qwen2.5-7B-Instruct",
    "DeepSeek-R1-Qwen3-8B": "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
    "Ministral-3-3B-Instruct": "mistralai/Mistral-Nemo-Instruct-2407",
    "Nemotron-3-Nano-4B": "nvidia/Nemotron-Mini-4B-Instruct",
    "Qwen3-4B-Thinking": "Qwen/Qwen2.5-3B-Instruct",
    "Qwen3.5-9B": "Qwen/Qwen2.5-7B",
    "Granite-Guardian-3.0-2B": "ibm-granite/granite-guardian-3.0-2b",
    "Phi-3-Mini-4K": "microsoft/Phi-3-mini-4k-instruct",
    "Codestral-22B": "mistralai/Codestral-22B-v0.1",
    "Devstral-Small-2-24B-Instruct": "mistralai/Mistral-Small-24B-Base-2501",
    "Gemma-2-9B-IT": "google/gemma-2-9b-it",
    "Qwen-2.5-3B-Instruct": "Qwen/Qwen2.5-3B-Instruct"
}

def main():
    for f in os.listdir(BASE_DIR):
        if f == "DockerDesktopWSL":
            continue
        
        repo_id = MAPPING.get(f)
        if not repo_id:
            print(f"[{f}] No mapping found.")
            continue
            
        target_dir = os.path.join(BASE_DIR, f)
        if not os.path.isdir(target_dir):
            continue
            
        print(f"[{f}] Downloading tokenizer.json from {repo_id}...")
        try:
            file_path = hf_hub_download(repo_id=repo_id, filename="tokenizer.json", cache_dir=target_dir, force_download=True, token=HF_TOKEN, local_dir=target_dir)
            print(f"  -> Downloaded: {file_path}")
        except Exception as e:
            print(f"  -> Error: {e}")
        time.sleep(1)

if __name__ == "__main__":
    main()
