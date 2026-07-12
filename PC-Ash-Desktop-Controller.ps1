Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Controller = Join-Path $Root 'ash-controller.js'
$LogDir = Join-Path $Root 'ash\logs'
$script:Process = $null

function Get-LatestSummary {
    $file = Get-ChildItem $LogDir -Filter 'ash-auto-dev-*.json' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $file) {
        return $null
    }

    try {
        $data = Get-Content $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
        $cycles = @($data.cycles)
        $last = if ($cycles.Count -gt 0) { $cycles[-1] } else { $null }

        [pscustomobject]@{
            Task = if ($last.selectedTask.task) {
                $last.selectedTask.task
            } else {
                $data.selectedTask.task
            }
            Repair = if ($last.repairTask.task) {
                $last.repairTask.task
            } else {
                $data.pendingRepairTask.task
            }
            Stage = $data.failureStage
            Result = $data.stopReason
            Cycles = $cycles.Count
            Error = $data.errorMessage
            Log = $file.FullName
        }
    }
    catch {
        $null
    }
}

function Get-GitText([string]$Arguments) {
    (& git -C $Root $Arguments.Split(' ') 2>$null | Out-String).Trim()
}

function Start-Agent {
    if ($script:Process -and -not $script:Process.HasExited) {
        return
    }

    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = 'node.exe'
    $info.Arguments = '"' + $Controller + '"'
    $info.WorkingDirectory = $Root
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.CreateNoWindow = $true

    $script:Process = New-Object System.Diagnostics.Process
    $script:Process.StartInfo = $info

    if ($script:Process.Start()) {
        $script:Process.StandardInput.WriteLine('auto')
        $script:Process.StandardInput.Flush()
    }
}

function Stop-Agent {
    if (-not $script:Process -or $script:Process.HasExited) {
        return
    }

    try {
        $script:Process.StandardInput.WriteLine('stop')
        $script:Process.StandardInput.Flush()
    }
    catch {
    }
}

function Refresh-View {
    $running = $script:Process -and -not $script:Process.HasExited
    $AgentValue.Text = if ($running) { 'RUNNING' } else { 'STOPPED' }

    $BranchValue.Text = Get-GitText 'branch --show-current'
    $status = Get-GitText 'status --short'
    $RepoValue.Text = if ($status) { 'Dirty' } else { 'Clean' }
    $CommitValue.Text = (& git -C $Root log -1 --pretty=format:'%h %s' 2>$null)

    $summary = Get-LatestSummary

    if ($summary) {
        $TaskValue.Text = $summary.Task
        $RepairValue.Text = $summary.Repair
        $StageValue.Text = $summary.Stage
        $ResultValue.Text = $summary.Result
        $CycleValue.Text = [string]$summary.Cycles
        $ErrorValue.Text = $summary.Error
        $script:LatestLog = $summary.Log
    }
}

function Add-Row($Parent, $Name, $Top) {
    $label = New-Object System.Windows.Forms.Label
    $label.Text = $Name
    $label.Left = 20
    $label.Top = $Top
    $label.Width = 130
    $label.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)

    $value = New-Object System.Windows.Forms.Label
    $value.Text = '-'
    $value.Left = 160
    $value.Top = $Top
    $value.Width = 820
    $value.Height = 30
    $value.AutoEllipsis = $true

    $Parent.Controls.Add($label)
    $Parent.Controls.Add($value)

    return $value
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'PC Ash Controller'
$form.Width = 1080
$form.Height = 610
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'PC Ash'
$title.Left = 22
$title.Top = 18
$title.Width = 300
$title.Height = 42
$title.Font = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$group = New-Object System.Windows.Forms.GroupBox
$group.Text = 'Autonomous Development'
$group.Left = 20
$group.Top = 75
$group.Width = 1020
$group.Height = 350
$form.Controls.Add($group)

$AgentValue = Add-Row $group 'Agent' 30
$BranchValue = Add-Row $group 'Branch' 65
$RepoValue = Add-Row $group 'Repository' 100
$CommitValue = Add-Row $group 'Latest Commit' 135
$TaskValue = Add-Row $group 'Current Task' 170
$RepairValue = Add-Row $group 'Repair Task' 205
$StageValue = Add-Row $group 'Failure Stage' 240
$ResultValue = Add-Row $group 'Result' 275
$CycleValue = Add-Row $group 'Cycles' 310
$ErrorValue = Add-Row $group 'Error' 335

$start = New-Object System.Windows.Forms.Button
$start.Text = 'Start / すすめる'
$start.Left = 20
$start.Top = 445
$start.Width = 180
$start.Height = 42
$start.Add_Click({
    Start-Agent
    Refresh-View
})
$form.Controls.Add($start)

$stop = New-Object System.Windows.Forms.Button
$stop.Text = 'Stop'
$stop.Left = 215
$stop.Top = 445
$stop.Width = 110
$stop.Height = 42
$stop.Add_Click({
    Stop-Agent
    Refresh-View
})
$form.Controls.Add($stop)

$refresh = New-Object System.Windows.Forms.Button
$refresh.Text = 'Refresh'
$refresh.Left = 340
$refresh.Top = 445
$refresh.Width = 110
$refresh.Height = 42
$refresh.Add_Click({ Refresh-View })
$form.Controls.Add($refresh)

$repo = New-Object System.Windows.Forms.Button
$repo.Text = 'Open Repository'
$repo.Left = 465
$repo.Top = 445
$repo.Width = 150
$repo.Height = 42
$repo.Add_Click({ Start-Process explorer.exe $Root })
$form.Controls.Add($repo)

$log = New-Object System.Windows.Forms.Button
$log.Text = 'Open Latest Log'
$log.Left = 630
$log.Top = 445
$log.Width = 150
$log.Height = 42
$log.Add_Click({
    if ($script:LatestLog) {
        Start-Process notepad.exe $script:LatestLog
    }
})
$form.Controls.Add($log)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Refresh-View })
$timer.Start()

$form.Add_Shown({ Refresh-View })

$form.Add_FormClosing({
    $timer.Stop()

    if ($script:Process -and -not $script:Process.HasExited) {
        try {
            $script:Process.StandardInput.WriteLine('exit')
            $script:Process.StandardInput.Flush()

            if (-not $script:Process.WaitForExit(3000)) {
                $script:Process.Kill()
            }
        }
        catch {
        }
    }
})

[void]$form.ShowDialog()
