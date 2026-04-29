# consolidar_modelos.ps1
# Junta todos los GGUFs y tokenizers en S:\Data Strix\Modelos LM Studio
$destino = "S:\Data Strix\Modelos LM Studio"

Write-Host "=== CONSOLIDADOR DE MODELOS MOSET ===" -ForegroundColor Cyan
Write-Host ""

# 1. Copiar Phi-3 de Naraka Studio
$phi3 = "S:\Naraka Studio\Modelos\Phi-3-mini-4k-instruct-q4.gguf"
if (Test-Path $phi3) {
    $target = Join-Path $destino "phi-3-mini\Phi-3-mini-4k-instruct-q4.gguf"
    if (-not (Test-Path (Split-Path $target))) { New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null }
    if (-not (Test-Path $target)) {
        Write-Host "[MOVE] Phi-3 -> $target" -ForegroundColor Yellow
        Copy-Item $phi3 $target
    } else {
        Write-Host "[SKIP] Phi-3 ya existe en destino" -ForegroundColor Gray
    }
}

# 2. Copiar modelos de "hola xd" que no esten duplicados
$holaXd = "S:\Data Strix\IMP\hola xd\models"
if (Test-Path $holaXd) {
    $ggufFiles = Get-ChildItem -Path $holaXd -Recurse -Filter "*.gguf" -ErrorAction SilentlyContinue
    foreach ($f in $ggufFiles) {
        # Deducir subcarpeta del modelo
        $rel = $f.Directory.Name
        $targetDir = Join-Path $destino $rel
        $targetFile = Join-Path $targetDir $f.Name
        if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
        if (-not (Test-Path $targetFile)) {
            Write-Host "[COPY] $($f.Name) -> $targetDir" -ForegroundColor Yellow
            Copy-Item $f.FullName $targetFile
        } else {
            Write-Host "[SKIP] $($f.Name) ya existe" -ForegroundColor Gray
        }
    }
}

# 3. Listar inventario final
Write-Host ""
Write-Host "=== INVENTARIO FINAL ===" -ForegroundColor Green
$allGguf = Get-ChildItem -Path $destino -Recurse -Filter "*.gguf" -ErrorAction SilentlyContinue
$allTokenizer = Get-ChildItem -Path $destino -Recurse -Filter "tokenizer.json" -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "MODELOS GGUF ($($allGguf.Count)):" -ForegroundColor Cyan
foreach ($g in $allGguf) {
    $sizeMB = [math]::Round($g.Length / 1MB)
    $parent = $g.Directory.Name
    Write-Host "  [$($sizeMB) MB] $parent/$($g.Name)" -ForegroundColor White
}

Write-Host ""
Write-Host "TOKENIZERS ($($allTokenizer.Count)):" -ForegroundColor Cyan
foreach ($t in $allTokenizer) {
    Write-Host "  $($t.FullName)" -ForegroundColor White
}

if ($allTokenizer.Count -eq 0) {
    Write-Host "  (!) No se encontraron tokenizer.json -- hay que descargarlos" -ForegroundColor Red
}

# 4. Descargar tokenizers desde HuggingFace para los modelos detectados
Write-Host ""
Write-Host "=== DESCARGANDO TOKENIZERS FALTANTES ===" -ForegroundColor Cyan

$tokenizerMap = @{
    "phi-3"      = @{ url = "https://huggingface.co/microsoft/Phi-3-mini-4k-instruct/resolve/main/tokenizer.json"; folder = "phi-3-mini" }
    "DeepSeek-R1" = @{ url = "https://huggingface.co/Qwen/Qwen3-8B/resolve/main/tokenizer.json"; folder = "DeepSeek-R1-0528-Qwen3-8B-GGUF" }
    "Qwen3-4B"   = @{ url = "https://huggingface.co/Qwen/Qwen3-4B/resolve/main/tokenizer.json"; folder = "Qwen3-4B-Thinking-2507-GGUF" }
    "Qwen3.5-9B" = @{ url = "https://huggingface.co/Qwen/Qwen3-8B/resolve/main/tokenizer.json"; folder = "Qwen3.5-9B-GGUF" }
    "Nemotron"   = @{ url = "https://huggingface.co/nvidia/Nemotron-Mini-4B-Instruct/resolve/main/tokenizer.json"; folder = "NVIDIA-Nemotron-3-Nano-4B-GGUF" }
    "Ministral"  = @{ url = "https://huggingface.co/mistralai/Ministral-8B-Instruct-2410/resolve/main/tokenizer.json"; folder = "Ministral-3-3B-Instruct-2512-GGUF" }
    "granite"    = @{ url = "https://huggingface.co/ibm-granite/granite-3.0-2b-instruct/resolve/main/tokenizer.json"; folder = "granite-3.0-2b-instruct-Q2_K-GGUF" }
}

foreach ($key in $tokenizerMap.Keys) {
    $info = $tokenizerMap[$key]
    $targetDir = Join-Path $destino $info.folder
    $targetFile = Join-Path $targetDir "tokenizer.json"
    
    if (-not (Test-Path $targetDir)) {
        # La carpeta del modelo no existe, buscar variante
        $candidates = Get-ChildItem -Path $destino -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "*$key*" }
        if ($candidates) {
            $targetDir = $candidates[0].FullName
            $targetFile = Join-Path $targetDir "tokenizer.json"
        } else {
            continue
        }
    }
    
    if (Test-Path $targetFile) {
        Write-Host "  [OK] $key - tokenizer ya existe" -ForegroundColor Green
        continue
    }
    
    Write-Host "  [DL] $key -> $targetFile" -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri $info.url -OutFile $targetFile -UseBasicParsing -ErrorAction Stop
        Write-Host "  [OK] $key descargado exitosamente" -ForegroundColor Green
    } catch {
        Write-Host "  [ERR] $key - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 5. Inventario final con tokenizers
Write-Host ""
Write-Host "=== RESULTADO FINAL ===" -ForegroundColor Green
$finalTokenizers = Get-ChildItem -Path $destino -Recurse -Filter "tokenizer.json" -ErrorAction SilentlyContinue
Write-Host "Modelos GGUF: $($allGguf.Count)" -ForegroundColor Cyan
Write-Host "Tokenizers: $($finalTokenizers.Count)" -ForegroundColor Cyan
foreach ($t in $finalTokenizers) {
    Write-Host "  $($t.Directory.Name)/tokenizer.json" -ForegroundColor White
}
Write-Host ""
Write-Host "Ruta central: $destino" -ForegroundColor Cyan
Write-Host "DONE" -ForegroundColor Green
