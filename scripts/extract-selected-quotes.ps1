param(
  [Parameter(Mandatory = $true)]
  [string[]]$Paths,
  [string]$OutputDir = "outputs/selected-quote-template-extract"
)

$ErrorActionPreference = "Stop"

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
  foreach ($path in $Paths) {
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
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

$workbooks | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDir "workbooks.json") -Encoding UTF8
$lineItems | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDir "line-items.json") -Encoding UTF8
$errors | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDir "errors.json") -Encoding UTF8

[pscustomobject]@{
  workbookCount = $workbooks.Count
  lineItemCount = $lineItems.Count
  errorCount = $errors.Count
  outputDir = (Resolve-Path -LiteralPath $OutputDir).Path
}
