param(
  [string]$OutputDir = "outputs/quote-template-extract"
)

$ErrorActionPreference = "Stop"

$paths = @(
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Horse Rig 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\PB Q Mini Cooper 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\PB Q Silverado Elite Motorcle Banking 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Pulse Elite Fully Electric Tracking Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Audi RS 4 Film 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Cheyenne Elite Tracking Vehicle & Air Ride Compact Process Trailer 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Cheyenne Elite Tracking Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Cheyenne with Banking Rig 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Dodge Elite Nov 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Explorer Elite  2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q GLC Dynamic Tracking Vehicle Non Circuit Work 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q GMC Sierra Elite Tracking Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q GMC Video Pursuit 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Land Rover Discovery 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Lightning F150 Plate Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Mini Cooper 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Raptor Elite 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Silverado Elite 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Silverado Elite Horse Rig 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Silverado Elite Motorcle Banking 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Sprinter No.1 Video Pursuit Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Sprinter No.2 Video Pursuit Vehicle 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Full Sized Tracking Vehicles\Q Tiger 6 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Low Loader No.1 OR No.2 London - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Low Loader No.2 - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Low Loader No.2 London - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\PB Q Low Loader No.1 - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Q Low Loader No.1 - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Low Loader No.1 London - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Low-Loaders\Low Loader No.1 OR No.2 - 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\POD Car\Pod Car Hire 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\POD Car\Pod Car Build 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Recce\Q Tracking Vehicle Recce 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Recce\Q Tracking Teams-Zoom Meeting 2026.xls",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Trojan Electric & Bicycle Banking-Rig 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Trojan Electric 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Trojan Electric and Motorcycle Banking Rig or Mini Low Loader 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Twizzy Electric 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\PB Q Trojan 4  Electric in Trailer  2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\PB Q Trojan Electric 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Atlas E-Bike Motorcycle 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Bandit Elite Motorcycle  2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Can Am Maverick 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Dominator Quad Electric 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Electric Bicycle  2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Enduromax Elite Off Road Motorcycle 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q E-Trike Tricycle Tracking Vehicle 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Panther 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Petrol Powered Trojan 2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Racing Quad  2026.xlsx",
  "C:\Users\MasonBickers\Bickers Action\Bickers Action - Documents\ALL WORKING DOCs\Tracking Quotes 2026 TV, Film, Commercial\Small Sized Tracking Vehicles\Q Rubicon Quad 2026.xlsx"
)

function CellText($cell) {
  if ($null -eq $cell) { return "" }
  $text = [string]$cell.Text
  if ([string]::IsNullOrWhiteSpace($text)) {
    $value = $cell.Value2
    if ($null -ne $value) { return [string]$value }
  }
  return $text.Trim()
}

function CellFormula($cell) {
  if ($null -eq $cell) { return "" }
  $formula = [string]$cell.Formula
  if ($formula.StartsWith("=")) { return $formula }
  return ""
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AskToUpdateLinks = $false
$excel.AutomationSecurity = 3

$workbooks = @()
$lineItems = @()
$errors = @()

try {
  foreach ($path in $paths) {
    $name = Split-Path -Leaf $path
    Write-Host "Extracting $name"
    if (!(Test-Path -LiteralPath $path)) {
      $errors += [pscustomobject]@{ file = $name; path = $path; error = "File not found" }
      continue
    }

    $wb = $null
    try {
      $wb = $excel.Workbooks.Open($path, 0, $true, 5, "", "", $true)
      $ws = $wb.Worksheets.Item(1)
      $used = $ws.UsedRange
      $maxRow = [Math]::Min([int]$used.Rows.Count, 600)
      $maxCol = [Math]::Min([int]$used.Columns.Count, 12)

      $header = [ordered]@{
        quoteDate = CellText($ws.Range("A3"))
        jobNo = CellText($ws.Range("D3"))
        quoteNo = CellText($ws.Range("E3"))
        productionCompany = CellText($ws.Range("A5"))
        production = CellText($ws.Range("D5"))
        productionContact = CellText($ws.Range("E5"))
        location = CellText($ws.Range("A7"))
        shootDates = CellText($ws.Range("D7"))
        bickersContact = CellText($ws.Range("E7"))
        serviceDescription = CellText($ws.Range("A9"))
      }

      $section = ""
      $totalRows = @()
      for ($r = 1; $r -le $maxRow; $r++) {
        $description = CellText($ws.Cells.Item($r, 1))
        $qty = CellText($ws.Cells.Item($r, 5))
        $unitPrice = CellText($ws.Cells.Item($r, 6))
        $total = CellText($ws.Cells.Item($r, 7))
        $totalFormula = CellFormula($ws.Cells.Item($r, 7))

        $hasRow = $description -or $qty -or $unitPrice -or $total -or $totalFormula
        if (!$hasRow) { continue }

        $isHeader = ($description -match "^(DESCRIPTION|Equipment|Labour|Location Work|Travel|Accommodation|Hotel|Production|Total Price|Excludes VAT|Notes|Terms)")
        if ($description -and !$qty -and !$unitPrice -and !$total -and $description -notmatch "^DESCRIPTION$") {
          $section = $description
        }
        if ($description -match "Total Price") {
          $totalRows += [pscustomobject]@{
            row = $r
            description = $description
            qty = $qty
            unitPrice = $unitPrice
            total = $total
            formula = $totalFormula
          }
        }

        if ($r -ge 10 -and ($description -or $qty -or $unitPrice -or $totalFormula -or $total)) {
          $lineItems += [pscustomobject]@{
            file = $name
            sheet = [string]$ws.Name
            row = $r
            section = $section
            description = $description
            qty = $qty
            unitPrice = $unitPrice
            total = $total
            totalFormula = $totalFormula
            qtyFormula = CellFormula($ws.Cells.Item($r, 5))
            unitPriceFormula = CellFormula($ws.Cells.Item($r, 6))
            isSectionOrHeader = [bool]$isHeader
          }
        }
      }

      $workbooks += [pscustomobject]@{
        file = $name
        path = $path
        sheet = [string]$ws.Name
        rows = $maxRow
        columns = $maxCol
        header = $header
        totals = $totalRows
      }
    } catch {
      $errors += [pscustomobject]@{ file = $name; path = $path; error = $_.Exception.Message }
    } finally {
      if ($null -ne $wb) { $wb.Close($false) | Out-Null }
    }
  }
} finally {
  $excel.Quit()
}

$workbooks | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDir "workbooks.json") -Encoding UTF8
$lineItems | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDir "line-items.json") -Encoding UTF8
$lineItems | Export-Csv -LiteralPath (Join-Path $OutputDir "line-items.csv") -NoTypeInformation -Encoding UTF8
$errors | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir "errors.json") -Encoding UTF8

[pscustomobject]@{
  workbookCount = $workbooks.Count
  lineItemCount = $lineItems.Count
  errorCount = $errors.Count
  outputDir = (Resolve-Path -LiteralPath $OutputDir).Path
}
