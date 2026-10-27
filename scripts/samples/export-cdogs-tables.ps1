# TASKS.csv #905 — export the three CDoGS metadata tables the public-geochemistry index needs, from the Geological
# Survey of Canada's metadata database (https://geochem.nrcan.gc.ca/ftp/data/miscel/db/db_cdogs_metadata.zip, Open
# Government Licence - Canada; a 513 MB Access file once unzipped), to CSV. Read-only, through the Windows Access ODBC
# driver ("Microsoft Access Driver (*.mdb, *.accdb)", 64-bit). Then: python -I scripts/samples/build-cdogs-index.py <dir>
#   powershell -File scripts/samples/export-cdogs-tables.ps1 -Database <path>\db_cdogs_metadata.accdb -Out <dir>
param([Parameter(Mandatory = $true)][string]$Database, [Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
$cn = New-Object System.Data.Odbc.OdbcConnection("Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=$Database;ReadOnly=1;")
$cn.Open()
$queries = @{
  "surveys" = "SELECT Organisation_ID, Survey_ID, Survey_Description_Short_en, Minimum_Latitude_NAD83, Maximum_Latitude_NAD83, Minimum_Longitude_NAD83, Maximum_Longitude_NAD83, Survey_Year, Published FROM Surveys"
  "survey_packages" = "SELECT Organisation_FieldWork_ID, Survey_ID, Analytical_Package_ID, Sample_Type_Description_Short_en, Preparation_Method_Name_en, Analytical_Status_Description_en, MAX(Number_Of_Samples_Analysed) AS N FROM Survey_Analytical_Summaries_DERIVED GROUP BY Organisation_FieldWork_ID, Survey_ID, Analytical_Package_ID, Sample_Type_Description_Short_en, Preparation_Method_Name_en, Analytical_Status_Description_en"
  "package_columns" = "SELECT Analytical_Package_ID, Package_Order_Of_Presentation, Spreadsheet_Column_Name, Analytical_Quantity_Abbreviation_en, Analytical_Quantity_Type_ID, Analytical_Unit_Name_en, Determination_Limit, Analytical_Technique_Abbreviation, Analytical_Decomposition_Abbreviation, Analytical_Package_Name_en, Laboratory_Name_en FROM Analytical_Package_Methods_DERIVED ORDER BY Analytical_Package_ID, Package_Order_Of_Presentation" # ORDER BY: TASKS.csv #984
}
foreach ($k in $queries.Keys) {
  $c = $cn.CreateCommand(); $c.CommandText = $queries[$k]; $c.CommandTimeout = 600
  $a = New-Object System.Data.Odbc.OdbcDataAdapter($c); $t = New-Object System.Data.DataTable; [void]$a.Fill($t)
  $t | Export-Csv -Path (Join-Path $Out "$k.csv") -NoTypeInformation -Encoding UTF8
  "$k : $($t.Rows.Count) rows"
}
$cn.Close()
