# Sprint 2 冒烟验证脚本 (PowerShell)
#
# 使用方法：
#   1. 先在另一个终端启动服务：pnpm docker:up && pnpm dev:server
#   2. 逐段执行本脚本（选中代码块 → F8 / 右键 Run Selection）
#   3. 每步检查输出是否符合 "预期" 注释
#
# 注意：每次从头测试前，建议重置数据库：
#   pnpm --filter @linkingchat/server exec prisma migrate reset --force

$BASE = "http://localhost:3008/api/v1"

# ══════════════════════════════════════════════
# Step 0: 健康检查 — 确认服务在线
# ══════════════════════════════════════════════

Write-Host "`n=== Step 0: Health Check ===" -ForegroundColor Cyan
$health = Invoke-RestMethod "$BASE/../health" -Method GET -ErrorAction SilentlyContinue
if ($health) {
    Write-Host "OK: Server is running" -ForegroundColor Green
} else {
    # NestJS 默认没有 /health，尝试直接注册
    Write-Host "No /health endpoint, will test with register directly" -ForegroundColor Yellow
}

# ══════════════════════════════════════════════
# Step 1: 注册用户 Alice — 应自动创建 Supervisor + Coding Bot
# ══════════════════════════════════════════════

Write-Host "`n=== Step 1: Register Alice ===" -ForegroundColor Cyan
$body = @{
    email       = "alice@test.com"
    username    = "alice"
    password    = "Test1234!"
    displayName = "Alice"
} | ConvertTo-Json

try {
    $res = Invoke-RestMethod "$BASE/auth/register" -Method POST -Body $body -ContentType "application/json"
    $ALICE_TOKEN = $res.accessToken
    $ALICE_ID = $res.user.id
    Write-Host "OK: Alice registered" -ForegroundColor Green
    Write-Host "  userId: $ALICE_ID"
    Write-Host "  token:  $($ALICE_TOKEN.Substring(0, 30))..."
} catch {
    $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($err.message -match "already") {
        Write-Host "Alice already exists, logging in..." -ForegroundColor Yellow
        $loginBody = @{ email = "alice@test.com"; password = "Test1234!" } | ConvertTo-Json
        $res = Invoke-RestMethod "$BASE/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
        $ALICE_TOKEN = $res.accessToken
        $ALICE_ID = $res.user.id
        Write-Host "OK: Alice logged in" -ForegroundColor Green
        Write-Host "  userId: $ALICE_ID"
    } else {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# 预期：201 Created，返回 user.id + accessToken + refreshToken
# 服务端日志应显示：Created 2 default bots for user xxx

# ══════════════════════════════════════════════
# Step 2: 查询 Bot 列表 — 应有 Supervisor + Coding Bot
# ══════════════════════════════════════════════

Write-Host "`n=== Step 2: Get Bot List ===" -ForegroundColor Cyan
$headers = @{ Authorization = "Bearer $ALICE_TOKEN" }

try {
    $bots = Invoke-RestMethod "$BASE/bots" -Method GET -Headers $headers
    Write-Host "OK: Found $($bots.Count) bots" -ForegroundColor Green
    foreach ($bot in $bots) {
        Write-Host "  - $($bot.name) (type=$($bot.type), isPinned=$($bot.isPinned), isDeletable=$($bot.isDeletable))"
    }

    # 验证点
    if ($bots.Count -ge 2) {
        $supervisor = $bots | Where-Object { $_.name -eq "Supervisor" }
        $codingBot = $bots | Where-Object { $_.name -eq "Coding Bot" }
        if ($supervisor -and $codingBot) {
            Write-Host "  PASS: Supervisor + Coding Bot both present" -ForegroundColor Green
        }
        if ($supervisor.isPinned -and -not $supervisor.isDeletable) {
            Write-Host "  PASS: Supervisor is pinned and not deletable" -ForegroundColor Green
        }
    } else {
        Write-Host "  WARN: Expected 2+ bots, got $($bots.Count)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# 预期：2 个 Bot，Supervisor (isPinned=true, isDeletable=false) + Coding Bot (isPinned=true, isDeletable=false)

# ══════════════════════════════════════════════
# Step 3: 查询会话列表 — 应有 2 个 Bot DM（含欢迎消息）
# ══════════════════════════════════════════════

Write-Host "`n=== Step 3: Get Converses ===" -ForegroundColor Cyan

try {
    $converses = Invoke-RestMethod "$BASE/converses" -Method GET -Headers $headers
    Write-Host "OK: Found $($converses.Count) conversations" -ForegroundColor Green

    foreach ($conv in $converses) {
        $lastMsg = if ($conv.lastMessage) { $conv.lastMessage.content.Substring(0, [Math]::Min(40, $conv.lastMessage.content.Length)) } else { "(none)" }
        Write-Host "  - id=$($conv.id) | isBot=$($conv.isBot) | isPinned=$($conv.isPinned) | botInfo=$($conv.botInfo.name) | lastMsg=`"$lastMsg`""
    }

    # 验证点
    $botConverses = $converses | Where-Object { $_.isBot -eq $true }
    if ($botConverses.Count -ge 2) {
        Write-Host "  PASS: 2+ Bot conversations found" -ForegroundColor Green
    }

    $pinned = $converses | Where-Object { $_.isPinned -eq $true }
    if ($pinned.Count -ge 2) {
        Write-Host "  PASS: Bot conversations are pinned" -ForegroundColor Green
    }

    # 检查置顶排序：isPinned 的应在前面
    $firstIsPinned = $converses[0].isPinned
    if ($firstIsPinned) {
        Write-Host "  PASS: Pinned conversation is at top" -ForegroundColor Green
    }

    # 检查欢迎消息
    $withWelcome = $botConverses | Where-Object { $_.lastMessage -ne $null }
    if ($withWelcome.Count -ge 2) {
        Write-Host "  PASS: Bot conversations have welcome messages" -ForegroundColor Green
    }

    # 保存一个 Bot 会话 ID 用于后续测试
    $BOT_CONVERSE_ID = $botConverses[0].id
    Write-Host "`n  Saved BOT_CONVERSE_ID: $BOT_CONVERSE_ID"
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# 预期：2 个 Bot DM 会话，都 isPinned=true, isBot=true, botInfo 非 null，各有 1 条欢迎消息

# ══════════════════════════════════════════════
# Step 4: 发消息给 Bot — 验证消息创建 + Bot 路由检测
# ══════════════════════════════════════════════

Write-Host "`n=== Step 4: Send Message to Bot ===" -ForegroundColor Cyan

if (-not $BOT_CONVERSE_ID) {
    Write-Host "SKIP: No Bot converse ID available" -ForegroundColor Yellow
} else {
    $msgBody = @{
        converseId = $BOT_CONVERSE_ID
        content    = "Hello Bot! Please help me run a command."
    } | ConvertTo-Json

    try {
        $msg = Invoke-RestMethod "$BASE/messages" -Method POST -Body $msgBody -ContentType "application/json" -Headers $headers
        Write-Host "OK: Message created" -ForegroundColor Green
        Write-Host "  messageId: $($msg.id)"
        Write-Host "  content: $($msg.content)"
        Write-Host "  type: $($msg.type)"
        Write-Host "  converseId: $($msg.converseId)"
        Write-Host ""
        Write-Host "  >>> 请检查服务端终端日志中是否出现:" -ForegroundColor Yellow
        Write-Host '  >>> [MessagesService] [Bot] Message to Supervisor/Coding Bot (bot-xxx): type=TEXT, content="Hello Bot!..."' -ForegroundColor Yellow
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# 预期：201 Created，服务端日志出现 [Bot] Message to xxx

# ══════════════════════════════════════════════
# Step 5: 查询消息历史 — 应有欢迎消息 + 刚发的消息
# ══════════════════════════════════════════════

Write-Host "`n=== Step 5: Get Message History ===" -ForegroundColor Cyan

if (-not $BOT_CONVERSE_ID) {
    Write-Host "SKIP: No Bot converse ID available" -ForegroundColor Yellow
} else {
    try {
        $history = Invoke-RestMethod "$BASE/messages?converseId=$BOT_CONVERSE_ID&limit=10" -Method GET -Headers $headers
        Write-Host "OK: $($history.messages.Count) messages, hasMore=$($history.hasMore)" -ForegroundColor Green
        foreach ($m in $history.messages) {
            $preview = if ($m.content) { $m.content.Substring(0, [Math]::Min(60, $m.content.Length)) } else { "(null)" }
            Write-Host "  [$($m.type)] $($m.author.displayName): $preview"
        }

        if ($history.messages.Count -ge 2) {
            Write-Host "  PASS: At least 2 messages (welcome + user message)" -ForegroundColor Green
        }
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 预期：至少 2 条消息（Bot 欢迎消息 + 用户消息），按时间倒序

# ══════════════════════════════════════════════
# Step 6: 注册用户 Bob
# ══════════════════════════════════════════════

Write-Host "`n=== Step 6: Register Bob ===" -ForegroundColor Cyan
$bobBody = @{
    email       = "bob@test.com"
    username    = "bob"
    password    = "Test1234!"
    displayName = "Bob"
} | ConvertTo-Json

try {
    $bobRes = Invoke-RestMethod "$BASE/auth/register" -Method POST -Body $bobBody -ContentType "application/json"
    $BOB_TOKEN = $bobRes.accessToken
    $BOB_ID = $bobRes.user.id
    Write-Host "OK: Bob registered" -ForegroundColor Green
    Write-Host "  userId: $BOB_ID"
} catch {
    $err = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($err.message -match "already") {
        Write-Host "Bob already exists, logging in..." -ForegroundColor Yellow
        $loginBody = @{ email = "bob@test.com"; password = "Test1234!" } | ConvertTo-Json
        $bobRes = Invoke-RestMethod "$BASE/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
        $BOB_TOKEN = $bobRes.accessToken
        $BOB_ID = $bobRes.user.id
        Write-Host "OK: Bob logged in, userId: $BOB_ID" -ForegroundColor Green
    } else {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ══════════════════════════════════════════════
# Step 7: Alice 发送好友请求给 Bob
# ══════════════════════════════════════════════

Write-Host "`n=== Step 7: Alice -> Bob Friend Request ===" -ForegroundColor Cyan

$reqBody = @{
    receiverId = $BOB_ID
    message    = "Hi Bob, let's be friends!"
} | ConvertTo-Json

try {
    $friendReq = Invoke-RestMethod "$BASE/friends/request" -Method POST -Body $reqBody -ContentType "application/json" -Headers $headers
    Write-Host "OK: Friend request sent" -ForegroundColor Green
    Write-Host "  requestId: $($friendReq.id)"
    Write-Host "  status: $($friendReq.status)"

    $REQUEST_ID = $friendReq.id
} catch {
    $errMsg = $_.ErrorDetails.Message
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $errMsg" -ForegroundColor Red
}

# 预期：201，status=PENDING

# ══════════════════════════════════════════════
# Step 8: Bob 查看待处理请求
# ══════════════════════════════════════════════

Write-Host "`n=== Step 8: Bob's Pending Requests ===" -ForegroundColor Cyan
$bobHeaders = @{ Authorization = "Bearer $BOB_TOKEN" }

try {
    $requests = Invoke-RestMethod "$BASE/friends/requests" -Method GET -Headers $bobHeaders
    Write-Host "OK: sent=$($requests.sent.Count), received=$($requests.received.Count)" -ForegroundColor Green
    if ($requests.received.Count -gt 0) {
        Write-Host "  From: $($requests.received[0].sender.displayName) - `"$($requests.received[0].message)`""
        Write-Host "  PASS: Bob sees Alice's request" -ForegroundColor Green
        if (-not $REQUEST_ID) { $REQUEST_ID = $requests.received[0].id }
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# ══════════════════════════════════════════════
# Step 9: Bob 接受好友请求 — 应创建 DM 会话
# ══════════════════════════════════════════════

Write-Host "`n=== Step 9: Bob Accepts Request ===" -ForegroundColor Cyan

if (-not $REQUEST_ID) {
    Write-Host "SKIP: No request ID" -ForegroundColor Yellow
} else {
    try {
        $acceptRes = Invoke-RestMethod "$BASE/friends/accept/$REQUEST_ID" -Method POST -Headers $bobHeaders
        Write-Host "OK: Friend request accepted" -ForegroundColor Green
        Write-Host "  friendshipId: $($acceptRes.friendshipId)"
        Write-Host "  converseId: $($acceptRes.converseId)"
        $DM_CONVERSE_ID = $acceptRes.converseId
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

# 预期：200，返回 friendshipId + converseId

# ══════════════════════════════════════════════
# Step 10: Alice 查看好友列表
# ══════════════════════════════════════════════

Write-Host "`n=== Step 10: Alice's Friend List ===" -ForegroundColor Cyan

try {
    $friends = Invoke-RestMethod "$BASE/friends" -Method GET -Headers $headers
    Write-Host "OK: $($friends.Count) friends" -ForegroundColor Green
    foreach ($f in $friends) {
        Write-Host "  - $($f.displayName) (status=$($f.status), converseId=$($f.converseId))"
    }
    if ($friends.Count -ge 1) {
        Write-Host "  PASS: Bob appears in friend list" -ForegroundColor Green
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# ══════════════════════════════════════════════
# Step 11: Alice 发消息给 Bob（普通 DM）
# ══════════════════════════════════════════════

Write-Host "`n=== Step 11: Alice sends DM to Bob ===" -ForegroundColor Cyan

if (-not $DM_CONVERSE_ID) {
    Write-Host "SKIP: No DM converse ID" -ForegroundColor Yellow
} else {
    $dmBody = @{
        converseId = $DM_CONVERSE_ID
        content    = "Hey Bob! How are you?"
    } | ConvertTo-Json

    try {
        $dmMsg = Invoke-RestMethod "$BASE/messages" -Method POST -Body $dmBody -ContentType "application/json" -Headers $headers
        Write-Host "OK: DM sent" -ForegroundColor Green
        Write-Host "  messageId: $($dmMsg.id)"
        Write-Host "  author: $($dmMsg.author.displayName)"

        # 服务端日志不应出现 [Bot] 检测（因为 Bob 不是 Bot）
        Write-Host "  >>> 服务端日志不应出现 [Bot] 检测（Bob 是普通用户）" -ForegroundColor Yellow
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ══════════════════════════════════════════════
# Step 12: Alice 的完整会话列表 — Bot 置顶 + 好友 DM
# ══════════════════════════════════════════════

Write-Host "`n=== Step 12: Alice's Full Converse List ===" -ForegroundColor Cyan

try {
    $allConverses = Invoke-RestMethod "$BASE/converses" -Method GET -Headers $headers
    Write-Host "OK: $($allConverses.Count) total conversations" -ForegroundColor Green

    $idx = 0
    foreach ($c in $allConverses) {
        $name = if ($c.botInfo) { $c.botInfo.name } else { "DM" }
        $lastMsg = if ($c.lastMessage) { $c.lastMessage.content.Substring(0, [Math]::Min(30, $c.lastMessage.content.Length)) } else { "(none)" }
        Write-Host "  [$idx] $name | isBot=$($c.isBot) | isPinned=$($c.isPinned) | unread=$($c.unreadCount) | last=`"$lastMsg`""
        $idx++
    }

    # 验证排序：isPinned=true 的应在前面
    $pinnedCount = ($allConverses | Where-Object { $_.isPinned }).Count
    $firstNPinned = $allConverses[0..($pinnedCount-1)] | Where-Object { $_.isPinned }
    if ($firstNPinned.Count -eq $pinnedCount) {
        Write-Host "  PASS: All pinned conversations are at the top" -ForegroundColor Green
    } else {
        Write-Host "  WARN: Pinned conversations not all at top" -ForegroundColor Yellow
    }

    # 验证总数：2 Bot DM + 1 好友 DM = 3
    if ($allConverses.Count -ge 3) {
        Write-Host "  PASS: 3+ conversations (2 Bot + 1 Friend DM)" -ForegroundColor Green
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# ══════════════════════════════════════════════
# Step 13: 边界测试 — 不可删除系统 Bot
# ══════════════════════════════════════════════

Write-Host "`n=== Step 13: Cannot Delete System Bot ===" -ForegroundColor Cyan

try {
    $bots = Invoke-RestMethod "$BASE/bots" -Method GET -Headers $headers
    $systemBot = $bots | Where-Object { $_.isDeletable -eq $false } | Select-Object -First 1

    if ($systemBot) {
        try {
            Invoke-RestMethod "$BASE/bots/$($systemBot.id)" -Method DELETE -Headers $headers
            Write-Host "FAIL: System bot was deleted (should be forbidden)" -ForegroundColor Red
        } catch {
            $status = $_.Exception.Response.StatusCode.value__
            if ($status -eq 403) {
                Write-Host "PASS: Delete system bot returned 403 Forbidden" -ForegroundColor Green
            } else {
                Write-Host "WARN: Expected 403, got $status" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "SKIP: No system bot found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

# ══════════════════════════════════════════════
# Step 14: 游标分页测试
# ══════════════════════════════════════════════

Write-Host "`n=== Step 14: Cursor Pagination ===" -ForegroundColor Cyan

if (-not $BOT_CONVERSE_ID) {
    Write-Host "SKIP: No Bot converse ID" -ForegroundColor Yellow
} else {
    try {
        # 获取第一页（limit=1）
        $page1 = Invoke-RestMethod "$BASE/messages?converseId=$BOT_CONVERSE_ID&limit=1" -Method GET -Headers $headers
        Write-Host "Page 1: $($page1.messages.Count) messages, hasMore=$($page1.hasMore), nextCursor=$($page1.nextCursor)"

        if ($page1.hasMore -and $page1.nextCursor) {
            # 获取第二页
            $cursor = [System.Web.HttpUtility]::UrlEncode($page1.nextCursor)
            $page2 = Invoke-RestMethod "$BASE/messages?converseId=$BOT_CONVERSE_ID&limit=1&cursor=$($page1.nextCursor)" -Method GET -Headers $headers
            Write-Host "Page 2: $($page2.messages.Count) messages, hasMore=$($page2.hasMore)"
            Write-Host "  PASS: Cursor pagination works" -ForegroundColor Green
        } elseif ($page1.messages.Count -le 1) {
            Write-Host "  OK: Only 1 or fewer messages, pagination not needed" -ForegroundColor Green
        }
    } catch {
        Write-Host "FAIL: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# ══════════════════════════════════════════════
# 验证总结
# ══════════════════════════════════════════════

Write-Host "`n"
Write-Host "═══════════════════════════════════════" -ForegroundColor White
Write-Host "  VERIFICATION COMPLETE" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════" -ForegroundColor White
Write-Host ""
Write-Host "请手动检查以下项目:" -ForegroundColor Yellow
Write-Host "  1. 服务端启动时无报错（特别是 Prisma/Redis 连接）"
Write-Host "  2. Step 4 后服务端日志出现 [Bot] Message to ... 检测日志"
Write-Host "  3. Step 11 后服务端日志 不 出现 [Bot] 检测（Bob 非 Bot）"
Write-Host "  4. 所有 PASS 项均为绿色"
Write-Host ""
Write-Host "如果出现 FAIL，请将错误信息反馈给我进行修复。" -ForegroundColor Yellow
