# TASKS.csv #3925 - the bridge an AI app (Claude Desktop, any MCP client) starts to reach the RUNNING GeoStrix.
# The packaged GeoStrix.exe has the RunAsNode fuse switched off (deliberate hardening), so it cannot be started as Node on a
# bridge script, and a GUI-subsystem exe has no stdin: this script does the relay instead, with nothing but Windows PowerShell.
#   powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<install>\resources\mcp-bridge.ps1"   (env GEOSTRIX_USER_DATA = GeoStrix's user-data folder)
# TASKS.csv #3964 (Matt: "I want it to always stay connected, like qgis") - the bridge never ends while the AI app holds it open, so the app
# shows GeoStrix as Running whether GeoStrix is open or not:
#   * initialize, ping and (until GeoStrix is reached) tools/list are answered here, from the tool list shipped beside this script
#     (mcpToolDefs.json, the one the installed GeoStrix serves); once connected, GeoStrix's own tools/list answers.
#   * GeoStrix is reached on the first tools/call: <userData>\mcp\endpoint.json is read THEN (the pipe's name and the per-launch token
#     change with every launch; the file is user-only and there only while Tools > AI App Access is switched on), the token said, and the
#     app's own initialize passed on (so GeoStrix asks the user to allow it, as before); its answer is kept here, the call goes on.
#   * GeoStrix not running, or the switch off: that call gets one plain MCP error saying what to do, and the bridge keeps running.
#     GeoStrix closed or restarted mid-session: every call it had not answered gets the same error; the next call connects again.
# GeoStrix's lines are copied back BYTE FOR BYTE (the UTF-8 of the messages is never re-encoded). It never starts GeoStrix, opens no
# window and nothing on the network. It ends when the AI app ends its input, once the calls already sent are answered (60 s at most).
param([string]$UserData)
$ErrorActionPreference = 'Stop'
$NotRunning = 'GeoStrix is not running, or AI App Access is switched off. In GeoStrix open Tools > AI App Access, switch it on, then ask again.'
# as electron/mcpProtocol.js answers initialize (test/mcpBridgeAlways3964 checks they match)
$Supported = @('2025-06-18', '2025-03-26', '2024-11-05')
$InstructionsChanges = "Access to the project open in GeoStrix. Start with project_summary. Results are capped and paged; ask for the next page with 'offset'. The tools whose description begins 'Makes a change in GeoStrix' work only while the user has switched on 'Allow AI apps to make changes' in GeoStrix; each change shows in GeoStrix and is one step of Undo, and none deletes or overwrites anything."
$InstructionsRead = "Read-only access to the project open in GeoStrix. Start with project_summary. Results are capped and paged; ask for the next page with 'offset'."
$utf8 = New-Object System.Text.UTF8Encoding $false
$stdin = [Console]::OpenStandardInput()
$stdout = [Console]::OpenStandardOutput()

if (-not $UserData) { $UserData = $env:GEOSTRIX_USER_DATA }
if (-not $UserData) { $UserData = Join-Path $env:APPDATA 'GeoStrix' }

# the tool list shipped beside this script, as one line of JSON (a JSON string holds no raw line break, so taking them out is safe)
$toolsJson = $null; $hasChanges = $false
try {
  $raw = [System.IO.File]::ReadAllText((Join-Path $PSScriptRoot 'mcpToolDefs.json'), $utf8)
  $toolsJson = $raw -replace "[`r`n]", ''
  $hasChanges = $raw -match '"readOnlyHint"\s*:\s*false'
} catch { $toolsJson = $null }

# complete lines (LF) out of a byte stream, found with IndexOf (a megabyte answer is not walked byte by byte in PowerShell): each line
# as its own bytes (no LF), the unfinished rest kept in $carry (a MemoryStream)
function Split-Lines([System.IO.MemoryStream]$carry, [byte[]]$buf, [int]$n) {
  $lines = New-Object System.Collections.Generic.List[byte[]]
  $start = 0
  while ($start -lt $n) {
    $i = [Array]::IndexOf($buf, [byte]10, $start, $n - $start)
    $end = $(if ($i -lt 0) { $n } else { $i })
    if ($end -gt $start) { $carry.Write($buf, $start, $end - $start) }
    if ($i -lt 0) { break }
    $lines.Add($carry.ToArray()); $carry.SetLength(0)
    $start = $i + 1
  }
  return ,$lines
}
function Write-Bytes([byte[]]$bytes) {
  try { $stdout.Write($bytes, 0, $bytes.Length); $stdout.WriteByte(10); $stdout.Flush() } catch { [Environment]::Exit(0) } # the AI app has gone
}
function Write-Line([string]$s) { Write-Bytes $utf8.GetBytes($s) }
function Reply-Error([string]$idJson, [int]$code, [string]$message) {
  Write-Line ("{""jsonrpc"":""2.0"",""id"":$idJson,""error"":{""code"":$code,""message"":" + (ConvertTo-Json -InputObject $message -Compress) + '}}')
}
function Reply-Result([string]$idJson, [string]$resultJson) { Write-Line "{""jsonrpc"":""2.0"",""id"":$idJson,""result"":$resultJson}" }

# the connection to GeoStrix: off | starting (the app's initialize sent, its answer awaited) | ready
$pipe = $null; $state = 'off'; $initId = $null; $initSeq = 0; $initLine = $null
$queue = New-Object System.Collections.Generic.List[byte[]]        # lines held until GeoStrix has answered the initialize
$outstanding = New-Object System.Collections.Generic.HashSet[string] # ids (as JSON) of the requests GeoStrix has not answered yet
$outBuf = New-Object byte[] 65536; $outCarry = New-Object System.IO.MemoryStream; $outTask = $null

# the connection is gone (or was refused): every request it had not answered gets $why
function Drop-Pipe([string]$why) {
  if ($script:pipe) { try { $script:pipe.Dispose() } catch { } }
  $script:pipe = $null; $script:state = 'off'; $script:outTask = $null; $script:outCarry.SetLength(0); $script:queue.Clear()
  foreach ($id in @($script:outstanding)) { Reply-Error $id -32000 $why }
  $script:outstanding.Clear()
}
function Send-ToApp([byte[]]$line) {
  try { $script:pipe.Write($line, 0, $line.Length); $script:pipe.WriteByte(10); $script:pipe.Flush(); return $true } catch { Drop-Pipe $NotRunning; return $false }
}
# reach GeoStrix: endpoint.json read now, the token said, the app's own initialize passed on. $false when it is not there
function Open-Pipe {
  $ep = $null
  try { $ep = Get-Content -LiteralPath (Join-Path $UserData 'mcp\endpoint.json') -Raw -Encoding UTF8 | ConvertFrom-Json } catch { $ep = $null }
  if (-not $ep -or -not $ep.pipe -or -not $ep.token) { return $false }
  if ($ep.pid -and -not (Get-Process -Id ([int]$ep.pid) -ErrorAction SilentlyContinue)) { return $false } # left by a GeoStrix that is gone
  $name = [string]$ep.pipe -replace '^\\\\\.\\pipe\\', ''
  $p = New-Object System.IO.Pipes.NamedPipeClientStream('.', $name, [System.IO.Pipes.PipeDirection]::InOut, [System.IO.Pipes.PipeOptions]::Asynchronous)
  try { $p.Connect(3000) } catch { try { $p.Dispose() } catch { }; return $false }
  $script:pipe = $p
  $script:initSeq++
  $init = $null
  if ($script:initLine) { try { $init = $script:initLine | ConvertFrom-Json } catch { $init = $null } }
  if (-not $init) { $init = [pscustomobject]@{ jsonrpc = '2.0'; method = 'initialize'; params = [pscustomobject]@{ protocolVersion = $Supported[0]; capabilities = [pscustomobject]@{}; clientInfo = [pscustomobject]@{ name = 'AI app' } } } }
  $init | Add-Member -NotePropertyName id -NotePropertyValue "geostrix-bridge-init-$($script:initSeq)" -Force
  $script:initId = ConvertTo-Json -InputObject $init.id -Compress
  $hello = $utf8.GetBytes("GEOSTRIX-MCP $($ep.token)")
  if (-not (Send-ToApp $hello)) { return $false }
  if (-not (Send-ToApp $utf8.GetBytes((ConvertTo-Json -InputObject $init -Depth 20 -Compress)))) { return $false }
  if (-not (Send-ToApp $utf8.GetBytes('{"jsonrpc":"2.0","method":"notifications/initialized"}'))) { return $false }
  $script:state = 'starting'
  $script:outTask = $p.ReadAsync($script:outBuf, 0, $script:outBuf.Length)
  return $true
}

# one line from the AI app
function On-ClientLine([byte[]]$bytes) {
  $text = $utf8.GetString($bytes).TrimEnd("`r")
  if (-not $text.Trim()) { return }
  $m = $null; try { $m = $text | ConvertFrom-Json } catch { $m = $null }
  if (-not $m -or -not $m.method) { if ($script:state -eq 'ready') { [void](Send-ToApp $bytes) }; return } # not ours to read: GeoStrix says
  $hasId = $m.PSObject.Properties.Name -contains 'id'
  if (-not $hasId) { # a notification: GeoStrix's, once it is there
    if ($script:state -eq 'ready') { [void](Send-ToApp $bytes) } elseif ($script:state -eq 'starting') { $script:queue.Add($bytes) }
    return
  }
  $id = ConvertTo-Json -InputObject $m.id -Compress
  switch ($m.method) {
    'initialize' {
      $script:initLine = $text
      $asked = [string]$m.params.protocolVersion
      $version = $(if ($Supported -contains $asked) { $asked } else { $Supported[0] })
      $instructions = $(if ($hasChanges) { $InstructionsChanges } else { $InstructionsRead })
      Reply-Result $id ('{"protocolVersion":' + (ConvertTo-Json -InputObject $version -Compress) + ',"capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"geostrix","title":"GeoStrix","version":"1"},"instructions":' + (ConvertTo-Json -InputObject $instructions -Compress) + '}')
      return
    }
    'ping' { Reply-Result $id '{}'; return }
    'tools/list' { if ($script:state -ne 'ready' -and $toolsJson) { Reply-Result $id ('{"tools":' + $toolsJson + '}'); return } }
    'tools/call' { }
    default { if ($script:state -ne 'ready') { Reply-Error $id -32601 ('Method not found: ' + ([string]$m.method).Substring(0, [Math]::Min(40, ([string]$m.method).Length))); return } }
  }
  # GeoStrix's to answer: reach it first
  if ($script:state -eq 'off' -and -not (Open-Pipe)) { Reply-Error $id -32000 $NotRunning; return }
  [void]$script:outstanding.Add($id)
  if ($script:state -eq 'starting') { $script:queue.Add($bytes) } else { [void](Send-ToApp $bytes) }
}

# one line from GeoStrix: its answer to the initialize sent here is kept here; the rest goes to the AI app as it came
$AnswerId = [regex]'^\{"jsonrpc":"2\.0","id":("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null)'
function On-AppLine([byte[]]$bytes) {
  $head = $utf8.GetString($bytes, 0, [Math]::Min($bytes.Length, 160))
  $mt = $AnswerId.Match($head)
  $id = $(if ($mt.Success) { $mt.Groups[1].Value } else { $null })
  if ($script:state -eq 'starting' -and $id -eq $script:initId) {
    if ($head.Substring($mt.Length).StartsWith(',"result"')) {
      $script:state = 'ready'
      $held = $script:queue.ToArray(); $script:queue.Clear()
      foreach ($l in $held) { if (-not (Send-ToApp $l)) { return } }
    } else { # GeoStrix refused (the user did not allow this app): its own words for every call waiting
      $why = $NotRunning; try { $why = [string](($utf8.GetString($bytes) | ConvertFrom-Json).error.message) } catch { }
      Drop-Pipe $why
    }
    return
  }
  Write-Bytes $bytes
  if ($id) { [void]$script:outstanding.Remove($id) }
}

$inBuf = New-Object byte[] 65536; $inCarry = New-Object System.IO.MemoryStream
$inEnded = $false; $endedAt = $null
$inTask = $stdin.ReadAsync($inBuf, 0, $inBuf.Length)
while ($true) {
  $tasks = New-Object System.Collections.Generic.List[System.Threading.Tasks.Task]
  if (-not $inEnded) { $tasks.Add($inTask) }
  if ($outTask) { $tasks.Add($outTask) }
  if ($tasks.Count -gt 0) { [void][System.Threading.Tasks.Task]::WaitAny($tasks.ToArray(), 250) } else { Start-Sleep -Milliseconds 50 }
  if (-not $inEnded -and $inTask.IsCompleted) {
    $n = 0; try { $n = $inTask.Result } catch { $n = 0 }
    if ($n -le 0) { $inEnded = $true; $endedAt = Get-Date }
    else {
      foreach ($line in (Split-Lines $inCarry $inBuf $n)) { On-ClientLine $line }
      $inTask = $stdin.ReadAsync($inBuf, 0, $inBuf.Length)
    }
  }
  if ($outTask -and $outTask.IsCompleted) {
    $n = 0; try { $n = $outTask.Result } catch { $n = 0 }
    if ($n -le 0) { Drop-Pipe $NotRunning } # GeoStrix closed the connection (quit, restarted, or switched off): the next call connects again
    else {
      foreach ($line in (Split-Lines $outCarry $outBuf $n)) { On-AppLine $line }
      if ($pipe) { $outTask = $pipe.ReadAsync($outBuf, 0, $outBuf.Length) }
    }
  }
  if ($inEnded -and ($outstanding.Count -eq 0 -or ((Get-Date) - $endedAt).TotalSeconds -gt 60)) { if ($pipe) { try { $pipe.Dispose() } catch { } }; [Environment]::Exit(0) }
}
