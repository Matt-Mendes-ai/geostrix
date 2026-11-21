# TASKS.csv #3925 - the bridge an AI app (Claude Desktop, any MCP client) starts to reach the RUNNING GeoStrix.
# The packaged GeoStrix.exe has the RunAsNode fuse switched off (deliberate hardening), so it cannot be started as Node on a
# bridge script, and a GUI-subsystem exe has no stdin: this script does the relay instead, with nothing but Windows PowerShell.
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<install>\resources\mcp-bridge.ps1"   (env GEOSTRIX_USER_DATA = GeoStrix's user-data folder)
# It reads the pipe's name and the per-launch token from <userData>\mcp\endpoint.json (a user-only file, there only while
# Tools > AI App Access is switched on), connects, says the token, and copies the client's lines to GeoStrix and GeoStrix's
# lines back, BYTE FOR BYTE (the UTF-8 of the messages is never re-encoded). It never starts GeoStrix and opens no window.
# GeoStrix not running, or the switch off: every request gets one MCP error that says what to do, and the script ends with its input.
# A client that ends its input right after its last request is still answered: the script waits for one answer per request.
param([string]$UserData)
$ErrorActionPreference = 'Stop'
$NotRunning = 'GeoStrix is not running, or AI App Access is switched off. In GeoStrix open Tools > AI App Access, switch it on, then ask again.'
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

if (-not $UserData) { $UserData = $env:GEOSTRIX_USER_DATA }
if (-not $UserData) { $UserData = Join-Path $env:APPDATA 'GeoStrix' }

# complete lines (LF) out of a byte stream, found with IndexOf (a megabyte answer is not walked byte by byte in PowerShell): the lines as
# UTF-8 strings, the unfinished rest kept in $carry (a MemoryStream). $keep: how much of a line is kept (an answer needs only its start)
function Split-Lines([System.IO.MemoryStream]$carry, [byte[]]$buf, [int]$n, [int]$keep = [int]::MaxValue) {
  $lines = New-Object System.Collections.Generic.List[string]
  $start = 0
  while ($start -lt $n) {
    $i = [Array]::IndexOf($buf, [byte]10, $start, $n - $start)
    $end = $(if ($i -lt 0) { $n } else { $i })
    $room = [Math]::Max(0, [Math]::Min($end - $start, $keep - [int]$carry.Length))
    if ($room -gt 0) { $carry.Write($buf, $start, $room) }
    if ($i -lt 0) { break }
    $lines.Add($utf8.GetString($carry.ToArray()).TrimEnd("`r")); $carry.SetLength(0)
    $start = $i + 1
  }
  return ,$lines
}
function Is-Request([string]$line) {
  if (-not $line.Trim()) { return $false }
  try { $m = $line | ConvertFrom-Json } catch { return $false }
  return ($null -ne $m.method) -and ($m.PSObject.Properties.Name -contains 'id')
}
function Write-Out([byte[]]$bytes, [int]$n) { $stdout.Write($bytes, 0, $n); $stdout.Flush() }

# GeoStrix not reachable: answer every request with the same error until the input ends
function Answer-Errors {
  [Console]::Error.WriteLine($NotRunning)
  $buf = New-Object byte[] 65536; $carry = New-Object System.IO.MemoryStream
  while (($n = $stdin.Read($buf, 0, $buf.Length)) -gt 0) {
    foreach ($line in (Split-Lines $carry $buf $n)) {
      if (-not $line.Trim()) { continue }
      try { $m = $line | ConvertFrom-Json } catch { continue }
      if (($null -ne $m.method) -and ($m.PSObject.Properties.Name -contains 'id')) {
        $id = ConvertTo-Json -InputObject $m.id -Compress
        $msg = ConvertTo-Json -InputObject $NotRunning -Compress
        $b = $utf8.GetBytes("{""jsonrpc"":""2.0"",""id"":$id,""error"":{""code"":-32000,""message"":$msg}}`n")
        Write-Out $b $b.Length
      }
    }
  }
  [Environment]::Exit(1)
}

# the endpoint, and is the GeoStrix that wrote it still running?
$endpoint = $null
try { $endpoint = Get-Content -LiteralPath (Join-Path $UserData 'mcp\endpoint.json') -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $endpoint = $null }
if (-not $endpoint -or -not $endpoint.pipe -or -not $endpoint.token) { Answer-Errors }
if ($endpoint.pid -and -not (Get-Process -Id ([int]$endpoint.pid) -ErrorAction SilentlyContinue)) { Answer-Errors }
$pipeName = [string]$endpoint.pipe -replace '^\\\\\.\\pipe\\', ''
$pipe = New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::Asynchronous)
try { $pipe.Connect(3000) } catch { Answer-Errors }
$hello = $utf8.GetBytes("GEOSTRIX-MCP $($endpoint.token)`n")
$pipe.Write($hello, 0, $hello.Length); $pipe.Flush()

# the relay: one loop over both directions; requests counted on the way in, answers on the way out
$inBuf = New-Object byte[] 65536; $outBuf = New-Object byte[] 65536
$inCarry = New-Object System.IO.MemoryStream; $outCarry = New-Object System.IO.MemoryStream
$pending = 0; $inEnded = $false
$inTask = $stdin.ReadAsync($inBuf, 0, $inBuf.Length)
$outTask = $pipe.ReadAsync($outBuf, 0, $outBuf.Length)
while ($true) {
  $tasks = @($outTask); if (-not $inEnded) { $tasks += $inTask }
  [void][System.Threading.Tasks.Task]::WaitAny([System.Threading.Tasks.Task[]]$tasks, 250)
  if (-not $inEnded -and $inTask.IsCompleted) {
    $n = 0; try { $n = $inTask.Result } catch { $n = 0 }
    if ($n -le 0) { $inEnded = $true }
    else {
      foreach ($line in (Split-Lines $inCarry $inBuf $n)) { if (Is-Request $line) { $pending++ } }
      try { $pipe.Write($inBuf, 0, $n); $pipe.Flush() } catch { [Environment]::Exit(1) }
      $inTask = $stdin.ReadAsync($inBuf, 0, $inBuf.Length)
    }
  }
  if ($outTask.IsCompleted) {
    $n = 0; try { $n = $outTask.Result } catch { $n = 0 }
    if ($n -le 0) { [Environment]::Exit(0) } # GeoStrix closed the connection (quit, or switched off)
    Write-Out $outBuf $n
    foreach ($line in (Split-Lines $outCarry $outBuf $n 64)) { if ($line.StartsWith('{"jsonrpc":"2.0","id":')) { $pending-- } }
    $outTask = $pipe.ReadAsync($outBuf, 0, $outBuf.Length)
  }
  if ($inEnded -and $pending -le 0) { try { $pipe.Dispose() } catch { }; [Environment]::Exit(0) }
}
