# Test CUDA detection - run from a clean powershell
$moset = "S:\Naraka Studio\Moset\moset-ecosystem\core-engine\target\release\moset.exe"
$output = ".fierro", "salir" | & $moset 2>&1
$output | Out-File "S:\Naraka Studio\Moset\moset-ecosystem\core-engine\cuda_test_result.txt" -Encoding utf8
Write-Host "Output written to cuda_test_result.txt"
