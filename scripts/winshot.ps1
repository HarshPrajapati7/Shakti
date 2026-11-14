# Dev helper: optionally click inside the Sakti window, wait, then save a screenshot of it.
# .\scripts\winshot.ps1 -Out status [-ClickX 825 -ClickY 665] [-Wait 3] [-Maximize]
param([string]$Out = "shot", [int]$ClickX = -1, [int]$ClickY = -1, [double]$Wait = 1, [switch]$Maximize)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices;
public class SaktiWin { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(int f, int x, int y, int d, int e);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
public struct R { public int L, T, Rt, B; } }
"@
[SaktiWin]::SetProcessDPIAware() | Out-Null
$p = Get-Process sakti | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $p) { throw "Sakti is not running" }
$h = $p.MainWindowHandle
if ($Maximize) { [SaktiWin]::ShowWindow($h, 3) | Out-Null; Start-Sleep 1 }
[SaktiWin]::SetForegroundWindow($h) | Out-Null; Start-Sleep -Milliseconds 300
$r = New-Object SaktiWin+R; [SaktiWin]::GetWindowRect($h, [ref]$r) | Out-Null
if ($ClickX -ge 0) { [SaktiWin]::SetCursorPos($r.L + $ClickX, $r.T + $ClickY) | Out-Null; Start-Sleep -Milliseconds 200; [SaktiWin]::mouse_event(2, 0, 0, 0, 0); Start-Sleep -Milliseconds 60; [SaktiWin]::mouse_event(4, 0, 0, 0, 0) }
Start-Sleep -Milliseconds ([int]($Wait * 1000))
$bmp = New-Object System.Drawing.Bitmap ($r.Rt - $r.L), ($r.B - $r.T)
[System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($r.L, $r.T, 0, 0, $bmp.Size)
$path = Join-Path $PSScriptRoot "..\logs\$Out.png"; $bmp.Save($path)
"$Out $($bmp.Width)x$($bmp.Height) at $($r.L),$($r.T)"
