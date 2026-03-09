# Sprint 4 — Phase 6: Nginx 反向代理

> **状态**：✅ 配置完成（nginx.conf + SSL + WS升级 + 限流 + metrics保护）
>
> **优先级**：P4（第 4 个工作包）
>
> **预估工作量**：1-2 天
>
> **前置条件**：Phase 5（云端部署）完成
>
> **参考**：[sprint4_implement.md](../sprint4_implement.md) Phase 6 | [websocket-protocol.md](../dev-plan/websocket-protocol.md) §9.3

---

## 目标

Nginx 作为 WebSocket 反向代理，处理 SSL 终止、请求限流、静态文件代理和 CORS 配置。

---

## 任务清单

| # | 任务 | 产出 | 依赖 | 状态 |
|---|------|------|------|------|
| 6.1 | Nginx 主配置 | `nginx/nginx.conf` | Phase 5 | 🔜 |
| 6.2 | WebSocket 升级配置 | proxy_set_header Upgrade | 6.1 | 🔜 |
| 6.3 | 超时配置 | proxy_read_timeout 120s | 6.1 | 🔜 |
| 6.4 | 请求限流 | limit_req_zone | 6.1 | 🔜 |
| 6.5 | 静态文件代理 | S3 CDN 或 Nginx 直接服务 | Phase 0 | 🔜 |
| 6.6 | CORS 配置 | 允许移动端和桌面端 | 6.1 | 🔜 |
| 6.7 | 访问日志 | access.log + logrotate | 6.1 | 🔜 |

---

## 核心配置

### nginx.conf

```nginx
worker_processes auto;
events {
    worker_connections 1024;
}

http {
    include       mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    keepalive_timeout 65;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    'rt=$request_time';

    access_log /var/log/nginx/access.log main;
    error_log  /var/log/nginx/error.log warn;

    # 限流区域
    limit_req_zone $binary_remote_addr zone=api:10m rate=100r/m;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=10r/m;
    limit_req_zone $binary_remote_addr zone=upload:10m rate=20r/m;

    # Gzip
    gzip on;
    gzip_types application/json text/plain;

    upstream backend {
        server server:3008;
    }

    # HTTP → HTTPS 重定向
    server {
        listen 80;
        server_name api.yourdomain.com;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name api.yourdomain.com;

        ssl_certificate     /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        client_max_body_size 50M;  # 文件上传限制

        # REST API
        location /api/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            limit_req zone=api burst=20 nodelay;
        }

        # Auth 限流（更严格）
        location /api/v1/auth/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;

            limit_req zone=auth burst=5 nodelay;
        }

        # Upload 限流
        location /api/v1/upload/ {
            proxy_pass http://backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;

            limit_req zone=upload burst=10 nodelay;
            client_max_body_size 50M;
        }

        # WebSocket (Socket.IO)
        location /socket.io/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 120s;
            proxy_send_timeout 120s;
        }

        # 健康检查
        location /health {
            proxy_pass http://backend;
        }
    }
}
```

### 关键参数说明

| 参数 | 值 | 原因 |
|------|-----|------|
| `proxy_read_timeout` | 120s | 必须 > Socket.IO pingInterval(25s) + pingTimeout(60s) = 85s |
| `limit_req zone=auth` | 10r/m | 防止暴力破解登录 |
| `limit_req zone=api` | 100r/m | 防止 API 滥用 |
| `client_max_body_size` | 50M | 对齐 Phase 0 最大文件限制 |

---

## 新增文件

```
nginx/nginx.conf
nginx/conf.d/         # 预留拆分配置的目录
scripts/ssl-renew.sh  # certbot renew + nginx reload
```

---

## 验收标准

- [ ] HTTPS 访问正常，HTTP 自动 301 到 HTTPS
- [ ] WebSocket 连接稳定，不会被 Nginx 超时断开
- [ ] Socket.IO 长连接 > 2 分钟不断开
- [ ] 限流生效：单 IP 超频返回 429
- [ ] access.log 正确记录请求
- [ ] SSL 证书自动续期正常
