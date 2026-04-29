param()
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$script:LogFile   = "$env:TEMP\moset_boot.log"
$script:ReadPos   = 0
$script:IsDone    = $false

# Contadores de compilacion
$script:TotalCrates   = 0
$script:CompiledCount = 0
$script:ErrorCount    = 0
$script:WarningCount  = 0
$script:PhaseText     = "Inicializando..."

if (Test-Path $script:LogFile) { Remove-Item $script:LogFile -Force }

# Deteccion de conflictos en puerto 1420
$script:ConflictPIDs = @()
$netOut = netstat -aon 2>$null | Select-String ":1420\s" | Select-String "LISTENING"
foreach ($line in $netOut) {
    $parts = ($line.ToString().Trim() -split '\s+')
    if ($parts[-1] -match '^\d+$') { $script:ConflictPIDs += $parts[-1] }
}
$script:HasConflict = $script:ConflictPIDs.Count -gt 0

# XAML — Splash rediseñado con contadores y barra de progreso real
[xml]$XAML = @'
<Window
    xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
    xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
    Title="Moset IDE" Height="480" Width="680"
    WindowStartupLocation="CenterScreen"
    ResizeMode="NoResize"
    WindowStyle="None"
    Background="Transparent"
    AllowsTransparency="True">
  <Window.Resources>
    <Style x:Key="BlueBtn" TargetType="Button">
      <Setter Property="Background" Value="#00E5FF"/>
      <Setter Property="Foreground" Value="#050A1F"/>
      <Setter Property="FontWeight" Value="Bold"/>
      <Setter Property="FontFamily" Value="Consolas"/>
      <Setter Property="FontSize" Value="11"/>
      <Setter Property="Padding" Value="18,9"/>
      <Setter Property="BorderThickness" Value="0"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" CornerRadius="4" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
    <Style x:Key="GhostBtn" TargetType="Button">
      <Setter Property="Background" Value="#101828"/>
      <Setter Property="Foreground" Value="#8892B0"/>
      <Setter Property="FontFamily" Value="Consolas"/>
      <Setter Property="FontSize" Value="11"/>
      <Setter Property="Padding" Value="18,9"/>
      <Setter Property="BorderThickness" Value="1"/>
      <Setter Property="BorderBrush" Value="#1E293B"/>
      <Setter Property="Cursor" Value="Hand"/>
      <Setter Property="Template">
        <Setter.Value>
          <ControlTemplate TargetType="Button">
            <Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="4" Padding="{TemplateBinding Padding}">
              <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/>
            </Border>
          </ControlTemplate>
        </Setter.Value>
      </Setter>
    </Style>
  </Window.Resources>
  <Border CornerRadius="12" BorderThickness="1" Margin="15">
    <Border.Background>
      <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
        <GradientStop Color="#080C17" Offset="0.0"/>
        <GradientStop Color="#0F172A" Offset="1.0"/>
      </LinearGradientBrush>
    </Border.Background>
    <Border.BorderBrush>
      <LinearGradientBrush StartPoint="0,0" EndPoint="1,1">
        <GradientStop Color="#00E5FF" Offset="0.0"/>
        <GradientStop Color="#0055FF" Offset="1.0"/>
      </LinearGradientBrush>
    </Border.BorderBrush>
    <Border.Effect>
      <DropShadowEffect Color="#00E5FF" BlurRadius="15" ShadowDepth="0" Opacity="0.35"/>
    </Border.Effect>
    <Grid Margin="28,24,28,20">
      <Grid.RowDefinitions>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="*"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
        <RowDefinition Height="Auto"/>
      </Grid.RowDefinitions>

      <!-- Row 0: Header -->
      <DockPanel Grid.Row="0" LastChildFill="False">
        <StackPanel Orientation="Horizontal" DockPanel.Dock="Left" VerticalAlignment="Center">
          <Border Width="48" Height="48" CornerRadius="8" Margin="0,0,12,0" ClipToBounds="True">
            <Border.Background>
              <ImageBrush x:Name="LogoBrush" Stretch="UniformToFill"/>
            </Border.Background>
          </Border>
          <TextBlock Text="MOSET" FontSize="32" FontWeight="Black" FontFamily="Consolas" VerticalAlignment="Center">
            <TextBlock.Foreground>
              <LinearGradientBrush StartPoint="0,0" EndPoint="1,0">
                <GradientStop Color="#00E5FF" Offset="0.0"/>
                <GradientStop Color="#007BFF" Offset="1.0"/>
              </LinearGradientBrush>
            </TextBlock.Foreground>
          </TextBlock>
          <TextBlock Text=" IDE" FontSize="32" FontWeight="Black" Foreground="#F8FAFC" FontFamily="Consolas" VerticalAlignment="Center"/>
          <TextBlock Text=" -- Motor Soberano v1.0" FontSize="12" Foreground="#00E5FF" Opacity="0.75"
                     FontFamily="Consolas" VerticalAlignment="Bottom" Margin="10,0,0,6"/>
        </StackPanel>
        <StackPanel DockPanel.Dock="Right" Orientation="Horizontal" VerticalAlignment="Top">
          <Button x:Name="BtnCopy" Content="Copiar Log"
                  Background="Transparent" Foreground="#64748B" FontFamily="Consolas"
                  FontSize="11" FontWeight="Bold" BorderThickness="0" Cursor="Hand"
                  Margin="0,2,10,0" ToolTip="Copiar log al portapapeles"/>
          <Button x:Name="BtnClose" Content="X"
                  Background="Transparent" Foreground="#64748B" FontFamily="Consolas"
                  FontSize="14" FontWeight="Bold" BorderThickness="0" Cursor="Hand"
                  Width="28" Height="28" Padding="0"
                  ToolTip="Cerrar (los procesos de compilacion seguiran en segundo plano)"/>
        </StackPanel>
      </DockPanel>

      <!-- Row 1: Status text -->
      <TextBlock x:Name="StatusText" Grid.Row="1"
                 Text="Sensibilizando red neuronal base..."
                 FontSize="11" Foreground="#94A3B8" FontFamily="Consolas" Margin="0,8,0,10"/>

      <!-- Row 2: Stats panel (counters) -->
      <Border Grid.Row="2" Background="#0A0F1E" CornerRadius="6" BorderBrush="#1E293B" BorderThickness="1" Padding="14,8" Margin="0,0,0,10">
        <Grid>
          <Grid.ColumnDefinitions>
            <ColumnDefinition Width="*"/>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="Auto"/>
            <ColumnDefinition Width="Auto"/>
          </Grid.ColumnDefinitions>

          <!-- Phase indicator -->
          <StackPanel Grid.Column="0" Orientation="Horizontal" VerticalAlignment="Center">
            <TextBlock x:Name="PhaseIcon" Text="&#x25CF;" FontSize="9" Foreground="#00E5FF" VerticalAlignment="Center" Margin="0,0,6,0"/>
            <TextBlock x:Name="PhaseLabel" Text="Inicializando..." FontSize="11" Foreground="#CBD5E1" FontFamily="Consolas" VerticalAlignment="Center"/>
          </StackPanel>

          <!-- Total crates -->
          <StackPanel Grid.Column="1" Orientation="Horizontal" Margin="16,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="Total: " FontSize="10" Foreground="#64748B" FontFamily="Consolas" VerticalAlignment="Center"/>
            <TextBlock x:Name="TotalLabel" Text="--" FontSize="12" Foreground="#F8FAFC" FontWeight="Bold" FontFamily="Consolas" VerticalAlignment="Center"/>
          </StackPanel>

          <!-- Compiled -->
          <StackPanel Grid.Column="2" Orientation="Horizontal" Margin="16,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="&#x2713; " FontSize="10" Foreground="#22C55E" FontFamily="Consolas" VerticalAlignment="Center"/>
            <TextBlock x:Name="CompiledLabel" Text="0" FontSize="12" Foreground="#22C55E" FontWeight="Bold" FontFamily="Consolas" VerticalAlignment="Center"/>
          </StackPanel>

          <!-- Warnings -->
          <StackPanel Grid.Column="3" Orientation="Horizontal" Margin="16,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="&#x26A0; " FontSize="10" Foreground="#F59E0B" FontFamily="Consolas" VerticalAlignment="Center"/>
            <TextBlock x:Name="WarningLabel" Text="0" FontSize="12" Foreground="#F59E0B" FontWeight="Bold" FontFamily="Consolas" VerticalAlignment="Center"/>
          </StackPanel>

          <!-- Errors -->
          <StackPanel Grid.Column="4" Orientation="Horizontal" Margin="16,0,0,0" VerticalAlignment="Center">
            <TextBlock Text="&#x2717; " FontSize="10" Foreground="#EF4444" FontFamily="Consolas" VerticalAlignment="Center"/>
            <TextBlock x:Name="ErrorLabel" Text="0" FontSize="12" Foreground="#EF4444" FontWeight="Bold" FontFamily="Consolas" VerticalAlignment="Center"/>
          </StackPanel>
        </Grid>
      </Border>

      <!-- Row 3: Log console -->
      <Border Grid.Row="3" Background="#04060C" CornerRadius="6" BorderBrush="#1E293B" BorderThickness="1">
        <Border.Effect>
          <DropShadowEffect Color="#000000" BlurRadius="5" ShadowDepth="2" Opacity="0.5"/>
        </Border.Effect>
        <ScrollViewer x:Name="LogScroll" VerticalScrollBarVisibility="Auto" Padding="14,12" MaxHeight="200">
          <TextBlock x:Name="LogText" FontFamily="Consolas" FontSize="10.5"
                     Foreground="#00E5FF" TextWrapping="Wrap" LineHeight="18"/>
        </ScrollViewer>
      </Border>

      <!-- Row 4: Progress bar with percentage -->
      <Grid Grid.Row="4" Margin="0,14,0,0">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <ProgressBar x:Name="PBar" Grid.Column="0" Height="6" Minimum="0" Maximum="100" Value="0"
                     Background="#0D1117" IsIndeterminate="False" BorderThickness="0">
          <ProgressBar.Foreground>
            <LinearGradientBrush StartPoint="0,0" EndPoint="1,0">
              <GradientStop Color="#00E5FF" Offset="0.0"/>
              <GradientStop Color="#0055FF" Offset="1.0"/>
            </LinearGradientBrush>
          </ProgressBar.Foreground>
        </ProgressBar>
        <TextBlock x:Name="PercentLabel" Grid.Column="1" Text="0%" FontSize="11" FontWeight="Bold"
                   Foreground="#00E5FF" FontFamily="Consolas" VerticalAlignment="Center" Margin="10,0,0,0"/>
      </Grid>

      <!-- Row 5: Bottom status line -->
      <TextBlock x:Name="BottomStatus" Grid.Row="5"
                 Text="Esperando señal del motor..."
                 FontSize="9" Foreground="#475569" FontFamily="Consolas" Margin="0,8,0,0"/>

      <!-- Row 6: Conflict Panel -->
      <Grid Grid.Row="6" x:Name="ConflictPanel" Visibility="Collapsed" Margin="0,10,0,0">
        <Grid.ColumnDefinitions>
          <ColumnDefinition Width="*"/>
          <ColumnDefinition Width="Auto"/>
          <ColumnDefinition Width="Auto"/>
        </Grid.ColumnDefinitions>
        <TextBlock Grid.Column="0" Text="Puerto 1420 ocupado por un proceso durmiente."
                   FontFamily="Consolas" FontSize="10" Foreground="#F59E0B" VerticalAlignment="Center"/>
        <Button x:Name="BtnKill" Grid.Column="1" Content="Liberar Red y Reiniciar"
                Style="{StaticResource BlueBtn}" Margin="0,0,8,0"/>
        <Button x:Name="BtnCancel" Grid.Column="2" Content="Cancelar"
                Style="{StaticResource GhostBtn}"/>
      </Grid>
    </Grid>
  </Border>
</Window>
'@

# Cargar ventana WPF
$reader = [System.Xml.XmlNodeReader]::new($XAML)
$Window = [System.Windows.Markup.XamlReader]::Load($reader)

$LogText       = $Window.FindName("LogText")
$LogScroll     = $Window.FindName("LogScroll")
$StatusText    = $Window.FindName("StatusText")
$PBar          = $Window.FindName("PBar")
$PercentLabel  = $Window.FindName("PercentLabel")
$PhaseIcon     = $Window.FindName("PhaseIcon")
$PhaseLabel    = $Window.FindName("PhaseLabel")
$TotalLabel    = $Window.FindName("TotalLabel")
$CompiledLabel = $Window.FindName("CompiledLabel")
$WarningLabel  = $Window.FindName("WarningLabel")
$ErrorLabel    = $Window.FindName("ErrorLabel")
$BottomStatus  = $Window.FindName("BottomStatus")
$ConflictPnl   = $Window.FindName("ConflictPanel")
$BtnKill       = $Window.FindName("BtnKill")
$BtnCancel     = $Window.FindName("BtnCancel")
$BtnClose      = $Window.FindName("BtnClose")
$BtnCopy       = $Window.FindName("BtnCopy")

# Cargar logo desde imagen
$LogoBrush = $Window.FindName("LogoBrush")
$logoPath = Join-Path $PSScriptRoot "..\..\Iconos Retro\moset-logo.png"
if (Test-Path $logoPath) {
    $bitmap = [System.Windows.Media.Imaging.BitmapImage]::new()
    $bitmap.BeginInit()
    $bitmap.UriSource = [Uri]::new((Resolve-Path $logoPath).Path)
    $bitmap.DecodePixelWidth = 96
    $bitmap.EndInit()
    $LogoBrush.ImageSource = $bitmap
}

$Window.Add_MouseLeftButtonDown({ $Window.DragMove() })

function Append-Log([string]$line) {
    $LogText.Text += $line + "`n"
    $LogScroll.ScrollToEnd()
}

function Update-Counters {
    # Temas de Color (Paleta Moset: Cian / Azul Eléctrico)
    $color_accent = "Cyan"
    $color_text = "White"
    $color_dim = "Gray"
    $color_success = "Green"
    $color_info = "Blue"

    $CompiledLabel.Text = "$($script:CompiledCount)"
    $WarningLabel.Text  = "$($script:WarningCount)"
    $ErrorLabel.Text    = "$($script:ErrorCount)"

    if ($script:TotalCrates -gt 0) {
        $TotalLabel.Text = "$($script:TotalCrates)"
        
        $pct = [math]::Floor(($script:CompiledCount / $script:TotalCrates) * 100)
        
        # Evitar mostrar 100% si no ha terminado la fase final (hasta que reciba MOSET_DONE)
        if ($script:CompiledCount -lt $script:TotalCrates -and $pct -ge 100) {
            $pct = 99
        }
        
        # Opcional: solo permitir que llegue a 100 temporalmente si IsDone es false, mantenerlo en 99
        if (-not $script:IsDone) {
            $pct = [math]::Min(99, $pct)
        }
        
        $PBar.Value = $pct
        $PercentLabel.Text = "$pct%"
    }

    # Color del icono de fase segun errores
    if ($script:ErrorCount -gt 0) {
        $PhaseIcon.Foreground = [System.Windows.Media.Brushes]::OrangeRed
    } elseif ($script:WarningCount -gt 0) {
        $PhaseIcon.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#F59E0B")
    } else {
        $PhaseIcon.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#00E5FF")
    }
}

# Lanzar ide_launcher.ps1 como proceso separado
$script:StartTime = [System.DateTime]::Now
function Launch-IDE {
    $launcherPath = Join-Path $PSScriptRoot "ide_launcher.ps1"
    $logArg = $script:LogFile
    $proc = Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", "`"$launcherPath`"",
        "-LogFile", "`"$logArg`""
    ) -ErrorAction SilentlyContinue -PassThru
    if ($proc) { $script:LauncherPID = $proc.Id }
}

# Timer que lee el log y actualiza la UI
$Timer = [System.Windows.Threading.DispatcherTimer]::new()
$Timer.Interval = [TimeSpan]::FromMilliseconds(150)

$Timer.Add_Tick({
    # Actualizar tiempo transcurrido
    $elapsed = [System.DateTime]::Now - $script:StartTime
    $em = [int]$elapsed.TotalMinutes
    $es = $elapsed.Seconds

    if ($StatusText.Text -notmatch 'listo|Error|Completado') {
        $StatusText.Text = "$($script:PhaseText) ($($em)m $($es)s)"
    }

    $BottomStatus.Text = "PID Launcher activo | Elapsed: $($em)m $($es)s | Crates: $($script:CompiledCount)/$($script:TotalCrates)"

    if (-not (Test-Path $script:LogFile)) { return }
    try {
        $fs = [System.IO.FileStream]::new(
            $script:LogFile,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::Read,
            [System.IO.FileShare]::ReadWrite
        )
        $fs.Seek($script:ReadPos, [System.IO.SeekOrigin]::Begin) | Out-Null
        $sr = [System.IO.StreamReader]::new($fs)
        $newContent = $sr.ReadToEnd()
        $script:ReadPos = $fs.Position
        $sr.Close(); $fs.Close()

        if ($newContent.Trim() -ne "") {
            foreach ($rawLine in ($newContent -split "`n")) {
                $line = $rawLine.Trim()
                if ($line -eq "") { continue }
                Append-Log $line

                # --- Detectar total de crates desde "Building [===] N/M" ---
                if ($line -match 'Building\s+\[.*?\]\s+(\d+)/(\d+)') {
                    $current = [int]$Matches[1]
                    $total   = [int]$Matches[2]
                    $script:TotalCrates = $total
                    $script:CompiledCount = $current
                    $script:PhaseText = "Compilando crates..."
                    $PhaseLabel.Text  = "Compilando crate $current de $total"
                    # Si es el ultimo o se termino de compilar y empieza a enlazar
                    if ($current -eq $total) {
                        $PhaseLabel.Text = "Enlazando binario e Iniciando CUDA..."
                        $PBar.IsIndeterminate = $true
                    } else {
                        $PBar.IsIndeterminate = $false
                    }
                    Update-Counters
                }

                # --- Detectar "Compiling <crate> vX.Y.Z" ---
                if ($line -match '^Compiling\s+(\S+)\s+v') {
                    $crateName = $Matches[1]
                    if ($crateName -eq "moset") {
                        $script:PhaseText = "Ensamblando IDE principal..."
                        $PhaseLabel.Text  = "Enlazando Motor (Llama.cpp/CUDA)..."
                        $PBar.IsIndeterminate = $true
                        $PBar.Value = 99
                        $PercentLabel.Text = "99%"
                    } else {
                        $script:PhaseText = "Compilando $crateName..."
                        $PhaseLabel.Text  = "Compilando: $crateName"
                    }
                }

                # --- Fase: Finalizo compilacion ---
                if ($line -match 'Finished\s+(release|dev|default)') {
                    $script:PhaseText = "Arranque final en proceso..."
                    $PhaseLabel.Text  = "Binario ensamblado. Activando UI..."
                    $PBar.IsIndeterminate = $true
                    $PBar.Value = 99
                    $PercentLabel.Text = "99%"
                }

                # --- Fase: Vite listo ---
                if ($line -match "ready in|Local.*localhost") {
                    $script:PhaseText = "Frontend listo. Compilando backend..."
                    $PhaseLabel.Text  = "Vite frontend listo"
                    $PhaseIcon.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#22C55E")
                    if ($PBar.Value -lt 10) {
                        $PBar.Value = 10
                        $PercentLabel.Text = "10%"
                    }
                }

                # --- Detectar warnings ---
                if ($line -match '^warning:' -or $line -match '^warning\[') {
                    $script:WarningCount++
                    Update-Counters
                }

                # --- Detectar errores ---
                if ($line -match '^error' -or $line -match 'could not compile') {
                    $script:ErrorCount++
                    $StatusText.Text = "Error detectado -- revisa el log"
                    $StatusText.Foreground = [System.Windows.Media.Brushes]::OrangeRed
                    Update-Counters
                }

                # --- MOSET_APP_READY: el backend arranco, el IDE esta vivo ---
                if ($line -match "MOSET_APP_READY") {
                    $script:IsDone = $true
                    $PBar.Value = 100
                    $PercentLabel.Text = "100%"
                    $PhaseLabel.Text = "Motor Soberano activo"
                    $PhaseIcon.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#22C55E")
                    $StatusText.Text = "Completado -- Moset IDE activo"
                    $StatusText.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFrom("#22C55E")
                    $BottomStatus.Text = "IDE lanzado exitosamente en $($em)m $($es)s"
                    Append-Log "[MOSET] ============================================="
                    Append-Log "[MOSET] Motor Soberano arrancado. Cerrando splash..."
                    Append-Log "[MOSET] ============================================="
                    # Esperar 0.5s para que el usuario vea el mensaje final
                    $closeTimer = [System.Windows.Threading.DispatcherTimer]::new()
                    $closeTimer.Interval = [TimeSpan]::FromMilliseconds(500)
                    $closeTimer.Add_Tick({
                        $closeTimer.Stop()
                        $Timer.Stop()
                        $Window.Close()
                    })
                    $closeTimer.Start()
                }

                # --- MOSET_ERROR: el proceso murio con error ---
                if ($line -match "MOSET_ERROR") {
                    $script:IsDone = $true
                    $PBar.Value = 100
                    $PBar.Foreground = [System.Windows.Media.Brushes]::OrangeRed
                    $PercentLabel.Text = "ERROR"
                    $PercentLabel.Foreground = [System.Windows.Media.Brushes]::OrangeRed
                    $PhaseLabel.Text = "Motor no arranco"
                    $PhaseIcon.Foreground = [System.Windows.Media.Brushes]::OrangeRed
                    $StatusText.Text = "Error -- el motor no pudo iniciar. Revisa el log."
                    $StatusText.Foreground = [System.Windows.Media.Brushes]::OrangeRed
                    $BottomStatus.Text = "Fallo en $($em)m $($es)s -- la ventana se mantendra abierta"
                    # NO cerrar la ventana para que el usuario pueda ver el log
                }
            }
        }
    } catch { }
})

$BtnKill.Add_Click({
    $ConflictPnl.Visibility = "Collapsed"
    $PBar.IsIndeterminate = $false
    $PBar.Value = 0
    $StatusText.Text = "Matando procesos y reiniciando..."
    Append-Log "[MOSET] Matando PIDs: $($script:ConflictPIDs -join ', ')..."
    foreach ($p in $script:ConflictPIDs) {
        try { Start-Process taskkill -ArgumentList "/f /pid $p" -NoNewWindow -Wait } catch {}
    }
    Start-Process taskkill -ArgumentList "/f /im node.exe" -NoNewWindow -Wait -ErrorAction SilentlyContinue
    Append-Log "[MOSET] Procesos eliminados. Reiniciando..."
    Launch-IDE
    $Timer.Start()
})

$BtnCancel.Add_Click({
    if (-not $script:IsDone -and $script:LauncherPID) {
        try { Start-Process taskkill -ArgumentList "/f /t /pid $($script:LauncherPID)" -NoNewWindow -Wait } catch {}
    }
    $Timer.Stop(); $Window.Close()
})

# Boton X - cierra la splash y mata el proceso de compilacion si no termino
$BtnClose.Add_Click({
    if (-not $script:IsDone -and $script:LauncherPID) {
        try { Start-Process taskkill -ArgumentList "/f /t /pid $($script:LauncherPID)" -NoNewWindow -Wait } catch {}
    }
    $Timer.Stop()
    $Window.Close()
})

$BtnCopy.Add_Click({
    if ([string]::IsNullOrWhiteSpace($LogText.Text)) { return }
    $LogText.Text | clip
})

# Arranque
if ($script:HasConflict) {
    $StatusText.Text = "Puerto 1420 ocupado -- elige una opcion"
    Append-Log "[MOSET] Conflicto detectado en puerto 1420."
    Append-Log "[MOSET] PIDs en conflicto: $($script:ConflictPIDs -join ', ')"
    $ConflictPnl.Visibility = "Visible"
    $PBar.Value = 0
} else {
    $script:PhaseText = "Iniciando Motor Soberano..."
    $PhaseLabel.Text  = "Limpiando entorno..."
    $StatusText.Text  = "Sistema limpio. Iniciando Motor Soberano..."
    Append-Log "[MOSET] Puerto 1420 libre. Arrancando..."
    Append-Log "[MOSET] Compilando backend Rust... (primera vez: 1-2 min)"
    Launch-IDE
    $Timer.Start()
}

$Window.ShowDialog() | Out-Null
