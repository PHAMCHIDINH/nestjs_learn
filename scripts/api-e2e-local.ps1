$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3010'
$global:results = @()

function Add-Result {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail
  )
  $global:results += [pscustomobject]@{
    name = $Name
    ok = $Ok
    detail = $Detail
  }
}

function Call-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = $null
  )

  $headers = @{}
  if ($Token) {
    $headers['Authorization'] = "Bearer $Token"
  }

  $params = @{
    Uri = "$base$Path"
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
    TimeoutSec = 20
  }

  if ($Body -ne $null) {
    $params['ContentType'] = 'application/json'
    $params['Body'] = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  Invoke-WebRequest @params
}

function Try-Call {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body = $null,
    [string]$Token = $null
  )

  try {
    $resp = Call-Api $Method $Path $Body $Token
    $json = $null
    if ($resp.Content) {
      $json = $resp.Content | ConvertFrom-Json
    }

    return [pscustomobject]@{
      ok = $true
      status = [int]$resp.StatusCode
      json = $json
      text = $resp.Content
    }
  }
  catch {
    $status = -1
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode
    }

    return [pscustomobject]@{
      ok = $false
      status = $status
      json = $null
      text = $_.Exception.Message
    }
  }
}

$logOut = Join-Path $env:TEMP 'backend-start-out.log'
$logErr = Join-Path $env:TEMP 'backend-start-err.log'
$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c "set PORT=3010 && npm run start"' -WorkingDirectory 'd:\base_code\backend-repo' -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru

try {
  $up = $false
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    $healthCheck = Try-Call 'GET' '/health'
    if ($healthCheck.ok -and $healthCheck.status -eq 200) {
      $up = $true
      break
    }
  }

  if (-not $up) {
    Add-Result 'Backend startup' $false 'Local backend did not become healthy on :3010'
  }
  else {
    Add-Result 'Backend startup' $true 'Local backend healthy on :3010'

    $health = Try-Call 'GET' '/health'
    Add-Result 'GET /health' ($health.ok -and $health.status -eq 200 -and $health.json.status -eq 'ok') "status=$($health.json.status), db=$($health.json.database)"

    $categories = Try-Call 'GET' '/categories'
    Add-Result 'GET /categories' ($categories.ok -and $categories.status -eq 200 -and $categories.json.Count -gt 0) "count=$($categories.json.Count)"

    $listingsResp = Try-Call 'GET' '/listings?page=1&limit=10'
    $listings = @()
    if ($listingsResp.ok -and $listingsResp.json.data) {
      $listings = @($listingsResp.json.data)
    }
    Add-Result 'GET /listings' ($listingsResp.ok -and $listings.Count -gt 0) "count=$($listings.Count), total=$($listingsResp.json.meta.total)"

    $listingId = $null
    $sellerId = $null
    if ($listings.Count -gt 0) {
      $listingId = $listings[0].id
      $sellerId = $listings[0].seller.id
      $listingDetail = Try-Call 'GET' "/listings/$listingId"
      Add-Result 'GET /listings/:id' ($listingDetail.ok -and $listingDetail.status -eq 200 -and $listingDetail.json.id -eq $listingId) "id=$listingId"
    }
    else {
      Add-Result 'GET /listings/:id' $false 'Skipped because no listing found'
    }

    $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $email = "apitest+$suffix@student.edu.vn"
    $studentId = "99$suffix"

    $register = Try-Call 'POST' '/auth/register' @{
      email = $email
      password = 'password123'
      name = 'API Test User'
      studentId = $studentId
      department = 'cntt'
    }
    $otp = $register.json.debugOtp
    Add-Result 'POST /auth/register' ($register.ok -and $register.status -eq 201 -and $otp.Length -eq 6) "email=$email, hasDebugOtp=$([bool]$otp)"

    $userToken = $null
    $createdUserId = $null
    if ($register.ok -and $otp) {
      $verify = Try-Call 'POST' '/auth/verify-otp' @{
        email = $email
        code = $otp
      }
      if ($verify.ok) {
        $userToken = $verify.json.accessToken
        $createdUserId = $verify.json.user.id
      }
      Add-Result 'POST /auth/verify-otp' ($verify.ok -and $verify.status -eq 200 -and $userToken.Length -gt 20) "userId=$createdUserId"
    }
    else {
      Add-Result 'POST /auth/verify-otp' $false 'Skipped because register failed'
    }

    if ($userToken) {
      $me = Try-Call 'GET' '/auth/me' $null $userToken
      Add-Result 'GET /auth/me' ($me.ok -and $me.status -eq 200 -and $me.json.email -eq $email) "email=$($me.json.email)"

      $createListingBody = @{
        title = "API test listing $suffix"
        description = 'San pham test API tu dong, mo ta du dai de qua validation backend.'
        price = 123000
        originalPrice = 200000
        category = 'textbook'
        condition = 'good'
        department = 'cntt'
        images = @('https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800')
      }

      $createdListingResp = Try-Call 'POST' '/listings' $createListingBody $userToken
      $createdListingId = $createdListingResp.json.id
      Add-Result 'POST /listings' ($createdListingResp.ok -and $createdListingResp.status -eq 201 -and $createdListingId.Length -gt 0) "id=$createdListingId"

      $myListings = Try-Call 'GET' '/users/me/listings?page=1&limit=10' $null $userToken
      $hasMine = $false
      if ($myListings.ok -and $createdListingId) {
        $hasMine = (@($myListings.json.data | Where-Object { $_.id -eq $createdListingId }).Count -gt 0)
      }
      Add-Result 'GET /users/me/listings' ($myListings.ok -and $hasMine) "containsCreated=$hasMine"

      $summary = Try-Call 'GET' '/dashboard/summary' $null $userToken
      Add-Result 'GET /dashboard/summary' ($summary.ok -and $summary.status -eq 200 -and $summary.json.myPosts -ge 1) "myPosts=$($summary.json.myPosts)"

      if ($listingId) {
        $saveResp = Try-Call 'POST' "/listings/$listingId/save" $null $userToken
        Add-Result 'POST /listings/:id/save' ($saveResp.ok -and $saveResp.status -eq 200 -and $saveResp.json.saved -eq $true) "saved=$($saveResp.json.saved)"

        $savedListings = Try-Call 'GET' '/users/me/saved-listings?page=1&limit=10' $null $userToken
        $hasSaved = $false
        if ($savedListings.ok) {
          $hasSaved = (@($savedListings.json.data | Where-Object { $_.id -eq $listingId }).Count -gt 0)
        }
        Add-Result 'GET /users/me/saved-listings' ($savedListings.ok -and $hasSaved) "containsListing=$hasSaved"

        $unsaveResp = Try-Call 'DELETE' "/listings/$listingId/save" $null $userToken
        Add-Result 'DELETE /listings/:id/save' ($unsaveResp.ok -and $unsaveResp.status -eq 200 -and $unsaveResp.json.saved -eq $false) "saved=$($unsaveResp.json.saved)"

        if ($sellerId) {
          $conversationResp = Try-Call 'POST' '/conversations' @{
            participantId = $sellerId
            productId = $listingId
          } $userToken
          $conversationId = $conversationResp.json.id
          Add-Result 'POST /conversations' ($conversationResp.ok -and $conversationResp.status -eq 201 -and $conversationId.Length -gt 0) "conversationId=$conversationId"

          if ($conversationId) {
            $sendMessage = Try-Call 'POST' "/conversations/$conversationId/messages" @{
              content = 'Xin chao, test API chat'
              type = 'text'
            } $userToken
            Add-Result 'POST /conversations/:id/messages' ($sendMessage.ok -and $sendMessage.status -eq 201 -and $sendMessage.json.id.Length -gt 0) "messageId=$($sendMessage.json.id)"

            $getMessages = Try-Call 'GET' "/conversations/$conversationId/messages?page=1&limit=20" $null $userToken
            $msgCount = if ($getMessages.ok) { @($getMessages.json.data).Count } else { 0 }
            Add-Result 'GET /conversations/:id/messages' ($getMessages.ok -and $msgCount -ge 1) "count=$msgCount"

            $markRead = Try-Call 'PATCH' "/conversations/$conversationId/read" $null $userToken
            Add-Result 'PATCH /conversations/:id/read' ($markRead.ok -and $markRead.status -eq 200) 'ok'
          }
          else {
            Add-Result 'POST /conversations/:id/messages' $false 'Skipped because conversation create failed'
            Add-Result 'GET /conversations/:id/messages' $false 'Skipped because conversation create failed'
            Add-Result 'PATCH /conversations/:id/read' $false 'Skipped because conversation create failed'
          }
        }

        $reportResp = Try-Call 'POST' '/reports' @{
          listingId = $listingId
          reason = 'Test report endpoint from API suite'
        } $userToken
        $reportId = $reportResp.json.id
        Add-Result 'POST /reports' ($reportResp.ok -and $reportResp.status -eq 201 -and $reportId.Length -gt 0) "reportId=$reportId"

        $adminLogin = Try-Call 'POST' '/auth/login' @{
          email = 'admin@student.edu.vn'
          password = 'password123'
        }
        $adminToken = $adminLogin.json.accessToken
        Add-Result 'POST /auth/login (admin)' ($adminLogin.ok -and $adminLogin.status -eq 200 -and $adminToken.Length -gt 20) "role=$($adminLogin.json.user.role)"

        if ($adminToken) {
          $pending = Try-Call 'GET' '/admin/listings/pending' $null $adminToken
          $containsCreated = $false
          if ($pending.ok -and $createdListingId) {
            $containsCreated = (@($pending.json | Where-Object { $_.id -eq $createdListingId }).Count -gt 0)
          }
          $pendingCount = if ($pending.ok) { @($pending.json).Count } else { 0 }
          Add-Result 'GET /admin/listings/pending' ($pending.ok -and $pending.status -eq 200) "count=$pendingCount, containsCreated=$containsCreated"

          if ($createdListingId) {
            $approve = Try-Call 'POST' "/admin/listings/$createdListingId/approve" $null $adminToken
            Add-Result 'POST /admin/listings/:id/approve' ($approve.ok -and $approve.status -in @(200, 201)) "listingId=$createdListingId"
          }
          else {
            Add-Result 'POST /admin/listings/:id/approve' $false 'Skipped because created listing missing'
          }

          $adminReports = Try-Call 'GET' '/admin/reports' $null $adminToken
          $reportExists = $false
          if ($adminReports.ok -and $reportId) {
            $reportExists = (@($adminReports.json | Where-Object { $_.id -eq $reportId }).Count -gt 0)
          }
          $adminReportCount = if ($adminReports.ok) { @($adminReports.json).Count } else { 0 }
          Add-Result 'GET /admin/reports' ($adminReports.ok -and $adminReports.status -eq 200 -and $reportExists) "count=$adminReportCount, containsCreated=$reportExists"

          if ($reportId) {
            $dismiss = Try-Call 'POST' "/admin/reports/$reportId/dismiss" $null $adminToken
            Add-Result 'POST /admin/reports/:id/dismiss' ($dismiss.ok -and $dismiss.status -in @(200, 201)) "reportId=$reportId"
          }
          else {
            Add-Result 'POST /admin/reports/:id/dismiss' $false 'Skipped because report missing'
          }
        }
      }
    }
  }
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}

$pass = ($global:results | Where-Object { $_.ok -eq $true }).Count
$fail = ($global:results | Where-Object { $_.ok -eq $false }).Count
Write-Output "PASS=$pass FAIL=$fail"
foreach ($r in $global:results) {
  $status = if ($r.ok) { 'PASS' } else { 'FAIL' }
  Write-Output "[$status] $($r.name) :: $($r.detail)"
}
