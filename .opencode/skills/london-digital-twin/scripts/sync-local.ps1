param(
  [string]$BaseUrl = "http://localhost:8787",
  [string]$Secret = $env:LDT_CRON_SECRET,
  [ValidateSet("reference", "status", "disruptions", "cleanup", "all")]
  [string]$Job = "all"
)

if ([string]::IsNullOrWhiteSpace($Secret)) {
  $Secret = "local-dev-cron-secret"
}

$jobs = if ($Job -eq "all") {
  @("reference", "status", "disruptions", "cleanup")
} else {
  @($Job)
}

foreach ($name in $jobs) {
  $uri = "$BaseUrl/sync/$name"
  try {
    $response = Invoke-RestMethod -Method Post -Uri $uri `
      -Headers @{ "x-cron-secret" = $Secret } `
      -TimeoutSec 180
    $status = $response.data.status
    $read = $response.data.recordsRead
    $upserted = $response.data.recordsUpserted
    Write-Host "[$name] status=$status read=$read upserted=$upserted"
  } catch {
    Write-Error "[$name] $($_.Exception.Message)"
    exit 1
  }
}
