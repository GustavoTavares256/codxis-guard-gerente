# Gera as imagens da página da loja (sem dados reais): tile promocional 440x280 e capturas 1280x800.
# Uso: powershell -ExecutionPolicy Bypass -File store/make-assets.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $PSScriptRoot 'assets'
New-Item -ItemType Directory -Force $out | Out-Null
$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'extension\icons\icon128.png'))

function Color($hex) { [System.Drawing.ColorTranslator]::FromHtml($hex) }
function RoundRect($x, $y, $w, $h, $r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90); $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90); $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure(); return $p
}
function NewCanvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'ClearTypeGridFit'; $g.InterpolationMode = 'HighQualityBicubic'
  return @($bmp, $g)
}
function Text($g, $s, $size, $style, $hex, $x, $y, $w = 0, $h = 0) {
  $f = New-Object System.Drawing.Font('Segoe UI', $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
  $b = New-Object System.Drawing.SolidBrush((Color $hex))
  if ($w -gt 0) { $g.DrawString($s, $f, $b, (New-Object System.Drawing.RectangleF($x, $y, $w, $h))) } else { $g.DrawString($s, $f, $b, $x, $y) }
}
function Save($bmp, $name) { $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose(); Write-Output "gerado store/assets/$name" }
$bold = [System.Drawing.FontStyle]::Bold; $reg = [System.Drawing.FontStyle]::Regular

# ---------- 1) Tile promocional pequeno 440x280 ----------
$bmp, $g = NewCanvas 440 280
$g.Clear((Color '#040823'))
$g.DrawImage($icon, 40, 52, 84, 84)
Text $g 'Codxis Guard' 40 $bold '#ffffff' 36 150
Text $g 'Senha do gerente no PDV web' 19 $reg '#d7d8db' 40 205
Text $g 'Cancelar venda  •  Remover item  •  Preço  •  Desconto' 13 $reg '#9aa0b4' 40 236
Save $bmp 'tile-440x280.png'

# ---------- 1b) Letreiro promocional 1400x560 ----------
$bmp, $g = NewCanvas 1400 560
$g.Clear((Color '#040823'))
$g.DrawImage($icon, 110, 150, 150, 150)
Text $g 'Codxis Guard' 84 $bold '#ffffff' 290 140
Text $g 'Senha do gerente para o PDV web da Codxis' 34 $reg '#d7d8db' 296 258
Text $g 'Cancelar venda  •  Remover item  •  Alterar preço  •  Desconto acima do limite' 24 $reg '#9aa0b4' 296 322
$g.FillPath((New-Object System.Drawing.SolidBrush((Color '#dcdcf7'))), (RoundRect 296 392 360 54 8))
$sf0 = New-Object System.Drawing.StringFormat; $sf0.Alignment = 'Center'; $sf0.LineAlignment = 'Center'
$fb = New-Object System.Drawing.Font('Segoe UI', 22, $bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Visual igual ao do sistema', $fb, (New-Object System.Drawing.SolidBrush((Color '#040823'))), (New-Object System.Drawing.RectangleF(296, 392, 360, 54)), $sf0)
Save $bmp 'letreiro-1400x560.png'

# ---------- 2) Captura 1: modal de autorização (ilustração) ----------
$bmp, $g = NewCanvas 1280 800
$g.Clear((Color '#c3d0d8'))
# fundo: PDV esmaecido (formas simples, sem dados)
$veil = New-Object System.Drawing.SolidBrush((Color '#d3dce3'))
$line = New-Object System.Drawing.SolidBrush((Color '#b8c6cf'))
$g.FillPath($veil, (RoundRect 30 30 600 740 16)); $g.FillPath($veil, (RoundRect 650 30 600 740 16))
foreach ($y in 140, 190, 240, 290) { $g.FillPath($line, (RoundRect 55 $y 550 26 6)) }
foreach ($y in 120, 180, 240) { $g.FillPath($line, (RoundRect 675 $y 550 34 6)) }
# modal
$mx = 420; $my = 215; $mw = 440; $mh = 312
$g.FillPath((New-Object System.Drawing.SolidBrush((Color '#ffffff'))), (RoundRect $mx $my $mw $mh 20))
$g.FillPath((New-Object System.Drawing.SolidBrush((Color '#d7d8db'))), (RoundRect ($mx + 40) ($my + 30) 48 48 5))
$g.DrawImage($icon, $mx + 46, $my + 36, 36, 36)
Text $g 'Autorização' 28 $bold '#333333' ($mx + 100) ($my + 28)
Text $g 'Cancelamento de venda — senha do gerente necessária.' 12 $bold '#333333' ($mx + 100) ($my + 66) 300 36
Text $g 'Senha do gerente' 14 $reg '#282e3f' ($mx + 40) ($my + 130)
$pen = New-Object System.Drawing.Pen((Color '#040823'), 1)
$g.DrawPath($pen, (RoundRect ($mx + 40) ($my + 158) 360 34 5))
Text $g '••••••' 18 $reg '#282e3f' ($mx + 52) ($my + 162)
$g.FillPath((New-Object System.Drawing.SolidBrush((Color '#040823'))), (RoundRect ($mx + 40) ($my + 232) 172 38 5))
$g.FillPath((New-Object System.Drawing.SolidBrush((Color '#282e3f'))), (RoundRect ($mx + 228) ($my + 232) 172 38 5))
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
$f14 = New-Object System.Drawing.Font('Segoe UI', 14, $reg, [System.Drawing.GraphicsUnit]::Pixel)
$wb = New-Object System.Drawing.SolidBrush((Color '#ffffff'))
$g.DrawString('Confirmar', $f14, $wb, (New-Object System.Drawing.RectangleF(($mx + 40), ($my + 232), 172, 38)), $sf)
$g.DrawString('Fechar', $f14, $wb, (New-Object System.Drawing.RectangleF(($mx + 228), ($my + 232), 172, 38)), $sf)
Text $g 'Ilustração: a venda só é cancelada depois da senha do gerente.' 13 $reg '#5a6672' 30 760
Save $bmp 'captura-1-autorizacao-1280x800.png'

# ---------- 3) Captura 2: recursos ----------
$bmp, $g = NewCanvas 1280 800
$g.Clear((Color '#040823'))
$g.DrawImage($icon, 90, 90, 96, 96)
Text $g 'Codxis Guard' 56 $bold '#ffffff' 210 92
Text $g 'Senha do gerente para o PDV web da Codxis' 26 $reg '#d7d8db' 212 168
$items = @(
  'Pede a senha antes de cancelar venda, remover item, alterar preço e confirmar desconto acima do limite',
  'Registra cada autorização e negação (data, ação, produto, valor) e exporta em CSV',
  'Bloqueio temporário após tentativas de senha incorretas',
  'Frente de caixa em abas Produtos | Pagamento (a tecla F4 volta ao layout original)',
  'Restaura os itens da venda quando a página é recarregada',
  'Visual igual ao do sistema, com tema claro e escuro'
)
$y = 290
foreach ($t in $items) {
  $g.FillEllipse((New-Object System.Drawing.SolidBrush((Color '#dcdcf7'))), 100, $y + 11, 12, 12)
  Text $g $t 24 $reg '#ffffff' 130 $y 1060 70
  $y += 78
}
Text $g 'As senhas ficam só no navegador, em formato de hash. Nenhum dado é enviado para servidores.' 18 $reg '#9aa0b4' 100 740
Save $bmp 'captura-2-recursos-1280x800.png'
$icon.Dispose()
