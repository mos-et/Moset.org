#!/usr/bin/env python3
"""
Corpus Generator para Moset
Extrae todos los archivos _.et_ y arma el moset_corpus.txt requerido para el fine_tune_naraka.py
"""

import os

def find_et_files(start_dir):
    et_files = []
    for root, dirs, files in os.walk(start_dir):
        # Ignore node_modules, target, .git
        if 'node_modules' in root or 'target' in root or '.git' in root or 'dist-tauri' in root:
            continue
            
        for f in files:
            if f.endswith(".et"):
                et_files.append(os.path.join(root, f))
    return et_files

def generate_corpus(ecosystem_path, output_path):
    print(f"Buscando archivos .et en {ecosystem_path}...")
    files = find_et_files(ecosystem_path)
    
    if not files:
        print("No se encontraron archivos .et. Asegurate de tener scripts o examples en el ecosistema.")
        return
        
    print(f"Encontrados {len(files)} archivos. Generando {output_path}...")
    
    with open(output_path, "w", encoding="utf-8") as out_f:
        for fpath in files:
            try:
                with open(fpath, "r", encoding="utf-8") as in_f:
                    content = in_f.read().strip()
                if content:
                    # Append file content with a separator
                    # We can use <|endoftext|> to separate files for GPT-2
                    out_f.write(content)
                    out_f.write("\n\n<|endoftext|>\n\n")
            except Exception as e:
                print(f"Error procesando {fpath}: {e}")
                
    print("Corpus generado exitosamente!")

if __name__ == "__main__":
    # Suponiendo que el ecosistema es un nivel arriba
    ecosystem_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "moset_corpus.txt")
    
    generate_corpus(ecosystem_dir, output_file)
