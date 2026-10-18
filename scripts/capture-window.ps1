param(
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [int]$MaxWidth=1600
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class DFWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out Rect r);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
}
'@
$game=@(Get-Process | Where-Object { $_.ProcessName -eq 'Dwarf Fortress' -and $_.MainWindowHandle -ne 0 })
if ($game.Count -ne 1) { throw "Expected one Dwarf Fortress window; found $($game.Count). Open one game window and retry." }
$game=$game[0]
$handle=$game.MainWindowHandle
if ([DFWindowCapture]::IsIconic($handle)) { throw 'Dwarf Fortress is minimized. Restore the game window and retry df_screenshot.' }
$rect=New-Object DFWindowCapture+Rect
if (![DFWindowCapture]::GetClientRect($handle,[ref]$rect)) { throw 'Cannot read the game window bounds.' }
$width=$rect.Right-$rect.Left; $height=$rect.Bottom-$rect.Top
if ($width -lt 100 -or $height -lt 100 -or $width -gt 10000 -or $height -gt 10000) { throw "Invalid game window size: ${width}x${height}" }
$bitmap=New-Object System.Drawing.Bitmap($width,$height)
try {
  $graphics=[System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $dc=$graphics.GetHdc()
    try { $ok=[DFWindowCapture]::PrintWindow($handle,$dc,3) }
    finally { $graphics.ReleaseHdc($dc) }
  } finally { $graphics.Dispose() }
  if (!$ok) { throw 'Windows could not capture the game window. Use windowed mode and retry.' }
  $colors=New-Object 'System.Collections.Generic.HashSet[int]'
  for ($x=0; $x -lt $width; $x+=[Math]::Max(1,[int]($width/32))) {
    for ($y=0; $y -lt $height; $y+=[Math]::Max(1,[int]($height/32))) { [void]$colors.Add($bitmap.GetPixel($x,$y).ToArgb()) }
  }
  if ($colors.Count -lt 8) { throw 'Game capture is blank or uniform. Restore the game in windowed mode and retry; no screenshot was returned.' }
  $outWidth=[Math]::Min($MaxWidth,$width); $outHeight=[Math]::Max(1,[int]($height*$outWidth/$width))
  $output=New-Object System.Drawing.Bitmap($outWidth,$outHeight)
  try {
    $g=[System.Drawing.Graphics]::FromImage($output)
    try { $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.DrawImage($bitmap,0,0,$outWidth,$outHeight) }
    finally { $g.Dispose() }
    $output.Save($OutputFile,[System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $output.Dispose() }
  @{path=$OutputFile;width=$outWidth;height=$outHeight;source_width=$width;source_height=$height;process_id=$game.Id;capture='PrintWindow-client';captured_at=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
} finally { $bitmap.Dispose() }
