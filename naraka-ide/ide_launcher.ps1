# ide_launcher.ps1
# Lee el output de npm run tauri dev linea por linea y lo escribe al log en tiempo real
param([string]$LogFile)

$env:NO_COLOR                   = '1'
$env:FORCE_COLOR                = '0'
$env:CARGO_TERM_COLOR           = 'never'
$env:CARGO_TERM_PROGRESS_WHEN   = 'never'
$env:CARGO_TERM_WIDTH           = '120'
$env:NPM_CONFIG_COLOR           = 'false'

# Ruta dinamica: se resuelve desde la ubicacion real del script (funciona en S:, T:, cualquier letra)
$IDERoot = Split-Path -Parent $PSScriptRoot
if (-not $IDERoot -or -not (Test-Path "$IDERoot\package.json")) {
    # Fallback: el script esta dentro del repo, el root es su carpeta padre
    $IDERoot = $PSScriptRoot
}
Set-Location $IDERoot

function Write-Log([string]$msg) {
    Add-Content -Path $LogFile -Value $msg
}

# Matar procesos residuales - sin ventanas visibles
Write-Log "[MOSET] Limpiando puerto 1420..."
$netOut = netstat -aon 2>$null | Select-String ':1420\s' | Select-String 'LISTENING'
foreach ($line in $netOut) {
    $parts = ($line.ToString().Trim() -split '\s+')
    if ($parts[-1] -match '^\d+$') {
        $pid = $parts[-1]
        try {
            $kpsi = New-Object System.Diagnostics.ProcessStartInfo
            $kpsi.FileName = 'taskkill.exe'
            $kpsi.Arguments = "/f /pid $pid"
            $kpsi.CreateNoWindow = $true
            $kpsi.UseShellExecute = $false
            [System.Diagnostics.Process]::Start($kpsi).WaitForExit()
        } catch {}
    }
}
if (Get-Process -Name "node" -ErrorAction SilentlyContinue) {
    $kpsi2 = New-Object System.Diagnostics.ProcessStartInfo
    $kpsi2.FileName = 'taskkill.exe'
    $kpsi2.Arguments = '/f /im node.exe'
    $kpsi2.CreateNoWindow = $true
    $kpsi2.UseShellExecute = $false
    [System.Diagnostics.Process]::Start($kpsi2).WaitForExit()
    Write-Log "[MOSET] node.exe eliminado."
}
Start-Sleep -Seconds 2

Write-Log "[MOSET] Iniciando compilador Rust + Vite..."
Write-Log "[MOSET] Cada linea de cargo apareceara aqui en tiempo real."

# Limpiar caches CUDA anteriores para evitar conflictos de compilacion
Write-Log "[MOSET] Limpiando caches CUDA anteriores..."
$cudaCacheDirs = @(
    "$env:LOCALAPPDATA\NVIDIA\DXCache",
    "$env:LOCALAPPDATA\NVIDIA\GLCache",
    "$env:LOCALAPPDATA\NVIDIA\ComputeCache"
)
foreach ($cdir in $cudaCacheDirs) {
    if (Test-Path $cdir) {
        try {
            Remove-Item -Path $cdir -Recurse -Force -ErrorAction SilentlyContinue
            New-Item -ItemType Directory -Path $cdir -Force | Out-Null
            Write-Log "[MOSET] Cache CUDA limpiado: $cdir"
        } catch {
            Write-Log "[MOSET] No se pudo limpiar: $cdir"
        }
    }
}
Write-Log "[MOSET] Caches CUDA limpios."

# Inyectar automaticamente las variables de MSVC para que CUDA/NVCC compile correctamente
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vcvars = ""
if (Test-Path $vswhere) {
    try {
        $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($vsPath) {
            $vcvars = "$vsPath\VC\Auxiliary\Build\vcvars64.bat"
        }
    } catch {}
}

$psi = New-Object System.Diagnostics.ProcessStartInfo
if ($vcvars -and (Test-Path $vcvars)) {
    Write-Log "[MOSET] Activando aceleracion de hardware MSVC/CUDA automaticamente..."
    
    # Bugfix CUDA 13.2 + MSVC (Fatal Error C1189)
    # Forza a cl.exe a usar el preprocesador moderno a nivel sistema nativo
    $env:CL = '/Zc:preprocessor'

    $psi.FileName = 'cmd.exe'
    $psi.Arguments = "/c `"call `"$vcvars`" && npm run tauri dev -- --release 2>&1`""
} else {
    Write-Log "[MOSET] No se detecto MSVC, corriendo estandar..."
    $psi.FileName = 'powershell.exe'
    $psi.Arguments = '-NoProfile -ExecutionPolicy Bypass -Command "npm run tauri dev -- --release 2>&1"'
}

$psi.WorkingDirectory       = $IDERoot
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError  = $true
$psi.UseShellExecute        = $false
$psi.CreateNoWindow         = $true
$psi.WindowStyle            = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
$psi.StandardErrorEncoding  = [System.Text.Encoding]::UTF8

$proc = [System.Diagnostics.Process]::Start($psi)

# Capturar stderr en hilo separado (no bloquea stdout)
$stderrJob = [System.Threading.Tasks.Task]::Run([System.Func[string]]{
    $proc.StandardError.ReadToEnd()
})

# Leer stdout linea por linea y escribir al log
$reader = $proc.StandardOutput
while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    if ($null -ne $line) {
        $clean = $line -replace '\x1b\[[0-9;?]*[mGKHFABCDEFJLMPSThlrsu]', ''
        $clean = $clean -replace '\x1b[=>]', ''
        $clean = $clean.Trim()
        if ($clean -ne '' -and $clean -notmatch '^\s*$') {
            Write-Log $clean
        }
    }
}

$proc.WaitForExit()
$exitCode = $proc.ExitCode
Write-Log "[MOSET] Proceso terminado con codigo: $exitCode"

if ($exitCode -eq 0) {
    Write-Log "MOSET_DONE"
} else {
    # Capturar stderr si hay contenido util
    if ($stderrJob.IsCompleted -and $stderrJob.Result) {
        foreach ($errLine in ($stderrJob.Result -split "`n")) {
            $errClean = $errLine.Trim()
            if ($errClean -ne '') { Write-Log "[STDERR] $errClean" }
        }
    }
    Write-Log "MOSET_ERROR"
    Write-Log "[MOSET] El motor no arranco (exit code $exitCode). Revisa el log."
}
