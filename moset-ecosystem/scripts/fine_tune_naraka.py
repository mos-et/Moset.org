import os
import logging
from typing import Optional
from dataclasses import dataclass

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
    DataCollatorForLanguageModeling,
    EarlyStoppingCallback,
)
from datasets import Dataset, DatasetDict

# ─────────────────────────────────────────────
# Configuración de logging
# ─────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# 1. Configuración centralizada
# ─────────────────────────────────────────────
@dataclass
class TrainingConfig:
    """Configuración centralizada del entrenamiento"""
    model_name: str = "gpt2"
    corpus_path: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "moset_corpus.txt")
    output_dir: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
    model_save_dir: str = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fine_tuned_moset_model")
    
    # Hiperparámetros
    max_length: int = 128
    train_split: float = 0.9          # 90% entrenamiento, 10% evaluación
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 4
    per_device_eval_batch_size: int = 4
    learning_rate: float = 5e-5
    weight_decay: float = 0.01
    warmup_steps: int = 500
    
    # Guardado y logging
    save_steps: int = 1_000
    eval_steps: int = 1_000
    logging_steps: int = 100
    save_total_limit: int = 2
    
    # Otros
    seed: int = 42
    fp16: bool = torch.cuda.is_available()  # Mixed precision si hay GPU


config = TrainingConfig()


# ─────────────────────────────────────────────
# 2. Carga del modelo y tokenizer
# ─────────────────────────────────────────────
def load_model_and_tokenizer(
    model_name: str,
) -> tuple[AutoModelForCausalLM, AutoTokenizer]:
    """
    Carga el modelo y tokenizer con configuración correcta para CLM
    
    Returns:
        Tupla (model, tokenizer)
    """
    logger.info(f"Cargando modelo: {model_name}")
    
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    
    # ✅ CORRECCIÓN: Usar eos_token como pad_token (práctica estándar en GPT-2)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        logger.info("pad_token configurado como eos_token")
    
    model = AutoModelForCausalLM.from_pretrained(model_name)
    
    # Solo redimensionar si se agregaron tokens nuevos
    if len(tokenizer) != model.config.vocab_size:
        model.resize_token_embeddings(len(tokenizer))
        logger.info(f"Embeddings redimensionados a: {len(tokenizer)}")
    
    # Configurar pad_token_id en el modelo
    model.config.pad_token_id = tokenizer.pad_token_id
    
    logger.info(
        f"Modelo cargado | "
        f"Parámetros: {model.num_parameters():,} | "
        f"Vocab size: {len(tokenizer)}"
    )
    
    return model, tokenizer


# ─────────────────────────────────────────────
# 3. Preparación del corpus
# ─────────────────────────────────────────────
def load_corpus(file_path: str, min_length: int = 10) -> list[str]:
    """
    Carga y limpia el corpus dialectal
    
    Args:
        file_path: Ruta al archivo de texto
        min_length: Longitud mínima de caracteres por ejemplo
        
    Returns:
        Lista de ejemplos limpios
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Corpus no encontrado: {file_path}")
    
    with open(file_path, "r", encoding="utf-8") as f:
        text_data = f.read()
    
    # Dividir por párrafos (doble salto de línea) primero, luego por línea
    paragraphs = text_data.split("\n\n")
    examples = []
    
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if len(paragraph) >= min_length:
            examples.append(paragraph)
        else:
            # Si el párrafo es corto, intentar líneas individuales
            for line in paragraph.split("\n"):
                line = line.strip()
                if len(line) >= min_length:
                    examples.append(line)
    
    logger.info(f"Corpus cargado: {len(examples)} ejemplos válidos")
    return examples


def create_dataset_splits(
    examples: list[str],
    train_split: float = 0.9,
    seed: int = 42,
) -> DatasetDict:
    """
    Crea splits de entrenamiento y evaluación
    
    Returns:
        DatasetDict con 'train' y 'validation'
    """
    dataset = Dataset.from_dict({"text": examples})
    
    # Dividir en train/validation
    split = dataset.train_test_split(
        test_size=1 - train_split,
        seed=seed,
    )
    
    return DatasetDict({
        "train": split["train"],
        "validation": split["test"],
    })


# ─────────────────────────────────────────────
# 4. Tokenización correcta para CLM
# ─────────────────────────────────────────────
def create_tokenize_function(tokenizer: AutoTokenizer, max_length: int):
    """
    ✅ CORRECCIÓN: Función de tokenización correcta para Causal LM
    
    En CLM:
    - input_ids son los tokens de entrada
    - labels son IGUALES a input_ids (el modelo predice el siguiente token)
    - El DataCollatorForLanguageModeling maneja esto automáticamente
    """
    def tokenize_function(batch: dict) -> dict:
        # ✅ batch["text"] es una lista de strings cuando batched=True
        tokenized = tokenizer(
            batch["text"],
            padding=False,          # ✅ El DataCollator hace el padding dinámico
            truncation=True,
            max_length=max_length,
        )
        return tokenized
    
    return tokenize_function


def tokenize_datasets(
    datasets: DatasetDict,
    tokenizer: AutoTokenizer,
    max_length: int,
) -> DatasetDict:
    """
    Aplica tokenización a todos los splits
    
    Returns:
        DatasetDict tokenizado (sin columna 'text')
    """
    tokenize_fn = create_tokenize_function(tokenizer, max_length)
    
    tokenized = datasets.map(
        tokenize_fn,
        batched=True,
        remove_columns=["text"],    # ✅ Eliminar columna original
        desc="Tokenizando corpus",
    )
    
    logger.info(
        f"Tokenización completa | "
        f"Train: {len(tokenized['train'])} | "
        f"Validation: {len(tokenized['validation'])}"
    )
    
    return tokenized


# ─────────────────────────────────────────────
# 5. Configuración del entrenamiento
# ─────────────────────────────────────────────
def create_training_arguments(config: TrainingConfig) -> TrainingArguments:
    """
    Crea los argumentos de entrenamiento optimizados
    """
    return TrainingArguments(
        output_dir=config.output_dir,
        
        # Épocas y batch
        num_train_epochs=config.num_train_epochs,
        per_device_train_batch_size=config.per_device_train_batch_size,
        per_device_eval_batch_size=config.per_device_eval_batch_size,
        
        # Optimización
        learning_rate=config.learning_rate,
        weight_decay=config.weight_decay,
        warmup_steps=config.warmup_steps,
        lr_scheduler_type="cosine",         # ✅ Scheduler coseno más efectivo
        
        # Evaluación
        eval_strategy="steps",              # ✅ Evaluar durante entrenamiento
        eval_steps=config.eval_steps,
        load_best_model_at_end=True,        # ✅ Cargar mejor modelo al final
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        
        # Guardado
        save_strategy="steps",
        save_steps=config.save_steps,
        save_total_limit=config.save_total_limit,
        
        # Logging
        logging_steps=config.logging_steps,
        report_to="none",                   # Cambiar a "tensorboard" si se usa
        
        # Performance
        fp16=config.fp16,
        dataloader_num_workers=2,
        
        # Reproducibilidad
        seed=config.seed,
    )


# ─────────────────────────────────────────────
# 6. Pipeline completo de entrenamiento
# ─────────────────────────────────────────────
def train_dialect_model(config: TrainingConfig) -> None:
    """
    Pipeline completo de fine-tuning
    """
    # ── Cargar modelo y tokenizer ──────────────
    model, tokenizer = load_model_and_tokenizer(config.model_name)
    
    # ── Preparar datos ─────────────────────────
    examples = load_corpus(config.corpus_path)
    datasets = create_dataset_splits(
        examples,
        train_split=config.train_split,
        seed=config.seed,
    )
    tokenized_datasets = tokenize_datasets(datasets, tokenizer, config.max_length)
    
    # ── Data Collator ──────────────────────────
    # ✅ CORRECCIÓN CLAVE: DataCollatorForLanguageModeling maneja labels automáticamente
    # mlm=False → Causal LM (no Masked LM como BERT)
    data_collator = DataCollatorForLanguageModeling(
        tokenizer=tokenizer,
        mlm=False,          # ✅ Causal Language Modeling
    )
    
    # ── Argumentos de entrenamiento ────────────
    training_args = create_training_arguments(config)
    
    # ── Trainer ────────────────────────────────
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=tokenized_datasets["validation"],  # ✅ Evaluación incluida
        processing_class=tokenizer,
        data_collator=data_collator,                    # ✅ Collator correcto
        callbacks=[
            EarlyStoppingCallback(early_stopping_patience=3)  # ✅ Early stopping
        ],
    )
    
    # ── Entrenamiento ──────────────────────────
    logger.info("Iniciando fine-tuning...")
    
    train_result = trainer.train()
    
    # Métricas de entrenamiento
    logger.info(f"Entrenamiento completado:")
    logger.info(f"  Loss final:   {train_result.training_loss:.4f}")
    logger.info(f"  Pasos totales: {train_result.global_step}")
    
    # ── Guardar modelo ─────────────────────────
    logger.info(f"Guardando modelo en: {config.model_save_dir}")
    trainer.save_model(config.model_save_dir)
    tokenizer.save_pretrained(config.model_save_dir)
    
    # Guardar métricas
    trainer.log_metrics("train", train_result.metrics)
    trainer.save_metrics("train", train_result.metrics)
    
    logger.info("✅ Fine-tuning completado exitosamente")


# ─────────────────────────────────────────────
# 7. Inferencia con el modelo ajustado
# ─────────────────────────────────────────────
def generate_text(
    prompt: str,
    model_dir: str = "./fine_tuned_dialect_model",
    max_new_tokens: int = 100,
    num_sequences: int = 1,
    temperature: float = 0.8,
    top_p: float = 0.92,
    top_k: int = 50,
) -> list[str]:
    """
    Genera texto usando el modelo fine-tuneado
    
    Args:
        prompt: Texto inicial para generación
        model_dir: Directorio del modelo guardado
        max_new_tokens: Máximo de tokens a generar
        num_sequences: Número de secuencias a generar
        temperature: Temperatura (mayor = más creativo)
        top_p: Nucleus sampling
        top_k: Top-K sampling
        
    Returns:
        Lista de textos generados
    """
    logger.info(f"Cargando modelo desde: {model_dir}")
    
    model = AutoModelForCausalLM.from_pretrained(model_dir)
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = model.to(device)
    model.eval()
    
    # Tokenizar el prompt
    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        padding=True,
    ).to(device)
    
    # Generar texto
    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            num_return_sequences=num_sequences,
            do_sample=True,
            temperature=temperature,
            top_p=top_p,
            top_k=top_k,
            pad_token_id=tokenizer.pad_token_id,
            eos_token_id=tokenizer.eos_token_id,
            repetition_penalty=1.2,     # ✅ Evitar repetición
        )
    
    # Decodificar resultados (solo tokens nuevos)
    generated_texts = []
    input_length = inputs["input_ids"].shape[1]
    
    for output in outputs:
        # Solo decodificar los tokens generados (no el prompt)
        new_tokens = output[input_length:]
        generated_text = tokenizer.decode(new_tokens, skip_special_tokens=True)
        generated_texts.append(generated_text)
    
    return generated_texts


# ─────────────────────────────────────────────
# 8. Punto de entrada
# ─────────────────────────────────────────────
if __name__ == "__main__":
    # Entrenamiento
    train_dialect_model(config)
