# descargar_modelos_livianos.ps1
# Descarga modelos GGUF livianos (<8B) + tokenizers desde HuggingFace
# Destino: S:\Data Strix\Modelos LM Studio

$destino = "S:\Data Strix\Modelos LM Studio"

Write-Host ""
Write-Host "=== MOSET MODEL DOWNLOADER ===" -ForegroundColor Cyan
Write-Host "Destino: $destino" -ForegroundColor Gray
Write-Host "Criterio: Modelos <= 8B, cuantizacion Q4_K_M" -ForegroundColor Gray
Write-Host ""

# Catalogo curado de modelos livianos con links directos de HuggingFace
$modelos = @(
    @{
        nombre   = "Phi-3-mini (3.8B)"
        carpeta  = "phi-3-mini"
        gguf_url = "https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf"
        gguf_file = "Phi-3-mini-4k-instruct-Q4_K_M.gguf"
        tok_url  = "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/resolve/main/tokenizer.json"
        size_gb  = "2.4"
        arch     = "Phi3"
    },
    @{
        nombre   = "Qwen2.5-3B-Instruct (3B)"
        carpeta  = "Qwen2.5-3B-Instruct"
        gguf_url = "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf"
        gguf_file = "qwen2.5-3b-instruct-q4_k_m.gguf"
        tok_url  = "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct/resolve/main/tokenizer.json"
        size_gb  = "2.0"
        arch     = "Qwen2"
    },
    @{
        nombre   = "SmolLM2-1.7B-Instruct (1.7B)"
        carpeta  = "SmolLM2-1.7B-Instruct"
        gguf_url = "https://huggingface.co/bartowski/SmolLM2-1.7B-Instruct-GGUF/resolve/main/SmolLM2-1.7B-Instruct-Q4_K_M.gguf"
        gguf_file = "SmolLM2-1.7B-Instruct-Q4_K_M.gguf"
        tok_url  = "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct/resolve/main/tokenizer.json"
        size_gb  = "1.1"
        arch     = "Llama"
    },
    @{
        nombre   = "TinyLlama-1.1B-Chat (1.1B)"
        carpeta  = "TinyLlama-1.1B-Chat"
        gguf_url = "https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
        gguf_file = "tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
        tok_url  = "https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0/resolve/main/tokenizer.json"
        size_gb  = "0.7"
        arch     = "Llama"
    },
    @{
        nombre   = "Gemma-2-2B-IT (2.6B)"
        carpeta  = "Gemma-2-2B-IT"
        gguf_url = "https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf"
        gguf_file = "gemma-2-2b-it-Q4_K_M.gguf"
        tok_url  = "https://huggingface.co/google/gemma-2-2b-it/resolve/main/tokenizer.json"
        size_gb  = "1.8"
        arch     = "Llama"
    }
)

# Mostrar catalogo
Write-Host "CATALOGO DE DESCARGA:" -ForegroundColor Yellow
Write-Host "-----------------------------------------------------" -ForegroundColor Gray
foreach ($m in $modelos) {
    Write-Host "  $($m.nombre) (~$($m.size_gb) GB) [$($m.arch)]" -ForegroundColor White
}
Write-Host "-----------------------------------------------------" -ForegroundColor Gray
Write-Host ""

$total = $modelos.Count
$current = 0

foreach ($m in $modelos) {
    $current++
    $dir = Join-Path $destino $m.carpeta
    $ggufPath = Join-Path $dir $m.gguf_file
    $tokPath  = Join-Path $dir "tokenizer.json"

    Write-Host "[$current/$total] $($m.nombre)" -ForegroundColor Cyan

    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Descargar GGUF
    if (Test-Path $ggufPath) {
        Write-Host "  [SKIP] GGUF ya existe" -ForegroundColor Green
    } else {
        Write-Host "  [DL] Descargando GGUF (~$($m.size_gb) GB)..." -ForegroundColor Yellow
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $m.gguf_url -OutFile $ggufPath -UseBasicParsing -ErrorAction Stop
            $sizeMB = [math]::Round((Get-Item $ggufPath).Length / 1MB)
            Write-Host "  [OK] GGUF descargado ($sizeMB MB)" -ForegroundColor Green
        } catch {
            Write-Host "  [ERR] $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # Descargar Tokenizer
    if (Test-Path $tokPath) {
        Write-Host "  [SKIP] Tokenizer ya existe" -ForegroundColor Green
    } else {
        Write-Host "  [DL] Descargando tokenizer.json..." -ForegroundColor Yellow
        try {
            Invoke-WebRequest -Uri $m.tok_url -OutFile $tokPath -UseBasicParsing -ErrorAction Stop
            Write-Host "  [OK] Tokenizer descargado" -ForegroundColor Green
        } catch {
            Write-Host "  [ERR] Tokenizer: $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    Write-Host ""
}

# Tambien descargar tokenizers para modelos que ya teniamos
Write-Host "=== DESCARGANDO TOKENIZERS PARA MODELOS EXISTENTES ===" -ForegroundColor Cyan

$existentes = @(
    @{ pattern = "*Nemotron*Nano*4B*"; tok_url = "https://huggingface.co/nvidia/Nemotron-Mini-4B-Instruct/resolve/main/tokenizer.json" },
    @{ pattern = "*Ministral*3B*";     tok_url = "https://huggingface.co/mistralai/Ministral-8B-Instruct-2410/resolve/main/tokenizer.json" },
    @{ pattern = "*Qwen3-4B*";         tok_url = "https://huggingface.co/Qwen/Qwen3-4B/resolve/main/tokenizer.json" },
    @{ pattern = "*granite*2b*";       tok_url = "https://huggingface.co/ibm-granite/granite-3.0-2b-instruct/resolve/main/tokenizer.json" }
)

foreach ($e in $existentes) {
    $dirs = Get-ChildItem -Path $destino -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $e.pattern }
    foreach ($d in $dirs) {
        $tokPath = Join-Path $d.FullName "tokenizer.json"
        if (Test-Path $tokPath) {
            Write-Host "  [OK] $($d.Name) - tokenizer existe" -ForegroundColor Green
        } else {
            Write-Host "  [DL] $($d.Name) - descargando tokenizer..." -ForegroundColor Yellow
            try {
                Invoke-WebRequest -Uri $e.tok_url -OutFile $tokPath -UseBasicParsing -ErrorAction Stop
                Write-Host "  [OK] $($d.Name) - tokenizer descargado" -ForegroundColor Green
            } catch {
                Write-Host "  [ERR] $($d.Name) - $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
}

# Inventario final
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  INVENTARIO FINAL - MODELOS MOSET" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

$allDirs = Get-ChildItem -Path $destino -Directory -ErrorAction SilentlyContinue
foreach ($d in $allDirs) {
    $ggufs = Get-ChildItem -Path $d.FullName -Filter "*.gguf" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike "mmproj*" }
    $tok   = Test-Path (Join-Path $d.FullName "tokenizer.json")
    
    if ($ggufs.Count -gt 0) {
        foreach ($g in $ggufs) {
            $sizeMB = [math]::Round($g.Length / 1MB)
            $status = if ($tok) { "LISTO" } else { "SIN TOKENIZER" }
            $color  = if ($tok) { "Green" } else { "Red" }
            Write-Host "  [$status] $($d.Name)/$($g.Name) ($sizeMB MB)" -ForegroundColor $color
        }
    }
}

Write-Host ""
Write-Host "Ruta central: $destino" -ForegroundColor Cyan
Write-Host "DONE" -ForegroundColor Green
