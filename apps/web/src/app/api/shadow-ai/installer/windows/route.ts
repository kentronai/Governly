import { createScanKey } from "@/lib/actions/shadow-ai";

/**
 * The Windows installer: a PowerShell script with this tenant's Governly URL and a fresh scan-only
 * key built in (the Windows twin of the Mac .pkg). Run once as administrator, or deploy with Intune
 * (Devices > Scripts, run as system). Signed-in tenant members only (middleware + createScanKey).
 */
const PYTHON = "3.12.8";
const ps = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function GET(request: Request) {
  const { token } = await createScanKey("windows");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  const origin = `${proto}://${host}`;
  const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

  const script = `# Governly Shadow AI installer for Windows.
# Installs the AI scanner for every user of this computer: a scan at login and every day at 6 PM,
# and the local scan helper (127.0.0.1:8766, read-only) that the Shadow AI page's
# "Scan this computer" button talks to and that closes AI apps your organization blocked.
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$Url = ${ps(origin)}
$Dir = Join-Path $env:ProgramData 'Governly'
New-Item -ItemType Directory -Force $Dir | Out-Null

# 1. Python 3.9+ (all users). Installed silently from python.org when missing.
# Only an all-users Python: the tasks run as every user, so one under a profile folder won't do.
function Find-Python {
  $code = 'import sys; print(sys.executable * (sys.version_info >= (3, 9)))'
  foreach ($cmd in @(@('py', '-3', '-c', $code), @('python', '-c', $code))) {
    try {
      $exe = & $cmd[0] $cmd[1..($cmd.Length - 1)] 2>$null | Select-Object -Last 1
      if ($exe -and (Test-Path $exe) -and $exe -notmatch 'WindowsApps|\\\\Users\\\\') { return $exe }
    } catch {}
  }
  $p = Join-Path $env:ProgramFiles 'Python312\\python.exe'
  if (Test-Path $p) { return $p }
  return $null
}
$Python = Find-Python
if (-not $Python) {
  Write-Host 'Installing Python ${PYTHON}...'
  $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
  $setup = Join-Path $env:TEMP "python-${PYTHON}-$arch.exe"
  Invoke-WebRequest "https://www.python.org/ftp/python/${PYTHON}/python-${PYTHON}-$arch.exe" -OutFile $setup -UseBasicParsing
  Start-Process $setup -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_test=0' -Wait
  $Python = Join-Path $env:ProgramFiles 'Python312\\python.exe'
  if (-not (Test-Path $Python)) { throw 'Python install failed.' }
}
$Pythonw = $Python -replace 'python\\.exe$', 'pythonw.exe'

# 2. The scanner and this organization's settings (Governly URL + scan-only key).
Invoke-WebRequest "$Url/shadow-ai-scan.py" -OutFile (Join-Path $Dir 'shadow-ai-scan.py') -UseBasicParsing
@'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>url</key><string>${xml(origin)}</string>
<key>token</key><string>${xml(token)}</string>
</dict></plist>
'@ | Set-Content -Encoding UTF8 (Join-Path $Dir 'config.plist')

# 3. Scheduled tasks that run as whoever is logged in (Users group), so each user's apps are scanned.
$Scan = Join-Path $Dir 'shadow-ai-scan.py'
$Users = New-ScheduledTaskPrincipal -GroupId 'S-1-5-32-545' -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -Force -TaskName 'Governly Shadow AI scan' -Principal $Users -Settings $Settings \`
  -Action (New-ScheduledTaskAction -Execute $Pythonw -Argument ('"' + $Scan + '"')) \`
  -Trigger @((New-ScheduledTaskTrigger -AtLogOn), (New-ScheduledTaskTrigger -Daily -At '6:00PM')) | Out-Null
Register-ScheduledTask -Force -TaskName 'Governly Shadow AI helper' -Principal $Users -Settings $Settings \`
  -Action (New-ScheduledTaskAction -Execute $Pythonw -Argument ('"' + $Scan + '" --serve')) \`
  -Trigger (New-ScheduledTaskTrigger -AtLogOn) | Out-Null
# Replaces a helper set up earlier with the one-line command, so only one runs.
schtasks /delete /f /tn GovernlyShadowAIHelper 2>$null | Out-Null

# 4. Start both now for the signed-in user (everyone else gets them at their next login).
Start-ScheduledTask -TaskName 'Governly Shadow AI helper'
Start-ScheduledTask -TaskName 'Governly Shadow AI scan'
Write-Host 'Governly Shadow AI installed. This computer will appear on the Shadow AI page in a minute.'
`;
  return new Response(script.replace(/\n/g, "\r\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="Governly-ShadowAI-Install.ps1"',
      "Cache-Control": "no-store",
    },
  });
}
