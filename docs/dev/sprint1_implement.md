> **鐘舵€侊細鉁?宸插畬鎴?* | 瀹屾垚鏃ユ湡锛?026-02-14 | 瀹炴柦璁板綍锛歔sprint1_implement_mark.md](./sprint1_implement_mark.md)

# Sprint 1锛氭渶灏忓叏閾捐矾 PoC

> **鐩爣**锛氭墜鏈哄彂涓€鏉℃枃瀛楁寚浠?鈫?浜戠杞彂 鈫?妗岄潰绔墽琛?Shell 鍛戒护 鈫?缁撴灉 <3绉?杩斿洖鎵嬫満鏄剧ず
>
> **鍓嶇疆鏉′欢**锛歔Sprint 0](./sprint0_implement.md) 宸插畬鎴?
>
> **涓嶅寘鍚?*锛氬ソ鍙嬬郴缁熴€佺兢鑱娿€丄I 鍔熻兘銆佹枃浠朵紶杈撱€佹秷鎭悳绱€佹帹閫侀€氱煡銆丅ot 妗嗘灦銆丱penClaw 娣卞害闆嗘垚
>
> **鍙傝€?*锛歔sprint-1-plan.md](../dev-plan/sprint-1-plan.md) | [websocket-protocol.md](../dev-plan/websocket-protocol.md)

---

## 浜や粯鐗?

| 浜や粯鐗?| 璇存槑 |
|--------|------|
| Cloud Brain | NestJS 鏈嶅姟绔細JWT RS256 璁よ瘉 + WebSocket /device 鍛藉悕绌洪棿 + REST API |
| Desktop PoC | Electron App锛氱櫥褰?鈫?杩炴帴 鈫?鎺ユ敹鍛戒护 鈫?Shell 鎵ц 鈫?鍥炴姤缁撴灉 |
| Mobile PoC | Flutter App锛氱櫥褰?鈫?璁惧鍒楄〃 鈫?鍙戦€佸懡浠?鈫?鏌ョ湅缁撴灉 |
| Shared Types | `@linkingchat/shared` + `@linkingchat/ws-protocol` 绫诲瀷鍖?|

## 楠屾敹鏍囧噯

```gherkin
GIVEN 鐢ㄦ埛鍦ㄦ墜鏈虹鍜屾闈㈢閮藉凡鐧诲綍鍚屼竴璐﹀彿
  AND 妗岄潰绔樉绀?"宸茶繛鎺? 鐘舵€?
WHEN 鐢ㄦ埛鍦ㄦ墜鏈虹杈撳叆 Shell 鍛戒护 (e.g. "ls -la")
  AND 閫夋嫨鐩爣妗岄潰璁惧
  AND 鐐瑰嚮 "鎵ц"
THEN 妗岄潰绔帴鏀跺埌鍛戒护
  AND 鎵ц Shell 鍛戒护
  AND 鎵ц缁撴灉鍦?3 绉掑唴杩斿洖鎵嬫満绔樉绀?
  AND commands 琛ㄤ腑璁板綍璇ユ鎵ц
```

---

## Phase 鍒嗚В涓庡苟琛岀瓥鐣?

```
Phase 0 (鍏变韩绫诲瀷)  鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                                                       鈹?
Phase 1 (Server: Auth + Device + WS Gateway)  鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                                                       鈹?
Phase 2 (Desktop: Electron + WS + Shell 鎵ц) 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹? 鈫?Phase 1-3 鍙儴鍒嗗苟琛?
                                                       鈹?   (鍚庣 Auth 瀹屾垚鍚庡墠绔嵆鍙紑濮?
Phase 3 (Mobile: Flutter + 鐧诲綍 + 鍛戒护鍙戦€?   鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
                                                       鈹?
Phase 4 (闆嗘垚娴嬭瘯 + Bug 淇)  鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
```

### 浜哄憳鍒嗛厤寤鸿锛?-3 浜猴級

| 寮€鍙戣€?| 璐熻矗 | Phase 鏂囨。 |
|--------|------|-----------|
| A锛堝悗绔級 | Phase 0 鈫?Phase 1 | [sprint1_phase0.md](./sprint1_phase0.md) 鈫?[sprint1_phase1.md](./sprint1_phase1.md) |
| B锛堟闈㈢锛?| Phase 2 | [sprint1_phase2.md](./sprint1_phase2.md) |
| C锛堢Щ鍔ㄧ锛?| Phase 3 | [sprint1_phase3.md](./sprint1_phase3.md) |
| 鍏ㄥ憳 | Phase 4 | [sprint1_phase4.md](./sprint1_phase4.md) |

> B 鍜?C 鍦ㄧ瓑鍚庣 Auth API 鏈熼棿锛屽彲浠ュ厛鎼?UI 楠ㄦ灦鍜屾湰鍦?mock銆?

---

## 浠诲姟渚濊禆鍥?

```
Phase 0 (鍏变韩绫诲瀷)
  鈹斺攢鈹€ 瀹氫箟 WS 浜嬩欢绫诲瀷 + Payload + Zod schemas

Phase 1 (Server)                     Phase 2 (Desktop)         Phase 3 (Mobile)
  Auth 妯″潡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€> 鐧诲綍鐣岄潰                  > 鐧诲綍椤甸潰
       鈹?                              鈹?                        鈹?
  Devices 妯″潡                        WS 瀹㈡埛绔繛鎺?             WS 瀹㈡埛绔繛鎺?
       鈹?                              鈹?                        鈹?
  WS Gateway (/device)               璁惧娉ㄥ唽                   璁惧鍒楄〃
       鈹?                              鈹?                        鈹?
  Commands Service                   鍛戒护鎺ユ敹 + exec()          鍛戒护杈撳叆 + 鍙戦€?
       鈹?                              鈹?                        鈹?
  E2E 娴嬭瘯                           缁撴灉鍥炴姤                   缁撴灉鏄剧ず

                        Phase 4 (闆嗘垚娴嬭瘯)
                          鍏ㄩ摼璺墜鍔ㄦ祴璇?
                          Bug 淇
                          榛戝悕鍗曞懡浠よ繃婊?
```

---

## 閲岀▼纰戞鏌ョ偣

| 妫€鏌ョ偣 | 楠屾敹鍐呭 | 瀵瑰簲 Phase |
|--------|---------|-----------|
| **M1** | Server 鍙繍琛岋細娉ㄥ唽 鈫?鐧诲綍 鈫?鑾峰彇 JWT 鈫?Swagger 鍙闂?| Phase 1 鍓嶅崐 |
| **M2** | WS 鍙繛鎺ワ細瀹㈡埛绔敤 JWT 杩炴帴 /device 鍛藉悕绌洪棿 | Phase 1 鍚庡崐 |
| **M3** | 妗岄潰绔彲鎵ц锛氭帴鏀跺懡浠?鈫?鎵ц 鈫?杩斿洖缁撴灉 | Phase 2 |
| **M4** | 鎵嬫満绔彲鎿嶆帶锛氬彂鍛戒护 鈫?鐪嬪埌缁撴灉 | Phase 3 |
| **M5** | 鍏ㄩ摼璺€氾細鎵嬫満 鈫?浜?鈫?妗岄潰 鈫?鎵嬫満 < 3 绉?| Phase 4 |

---

## REST API 绔偣 (Sprint 1)

### Auth

| Method | Path | 璇存槑 |
|--------|------|------|
| POST | `/api/v1/auth/register` | 娉ㄥ唽锛坅rgon2 hash锛?|
| POST | `/api/v1/auth/login` | 鐧诲綍 鈫?JWT RS256 token pair |
| POST | `/api/v1/auth/refresh` | 鍒锋柊 access token |
| POST | `/api/v1/auth/logout` | 鐧诲嚭锛堝垹闄?refresh token锛?|

### Devices

| Method | Path | 璇存槑 |
|--------|------|------|
| GET | `/api/v1/devices` | 褰撳墠鐢ㄦ埛璁惧鍒楄〃 |
| GET | `/api/v1/devices/:id` | 鍗曚釜璁惧璇︽儏 |
| PATCH | `/api/v1/devices/:id` | 鏇存柊璁惧鍚嶇О |
| DELETE | `/api/v1/devices/:id` | 鍒犻櫎璁惧 |

### Commands

| Method | Path | 璇存槑 |
|--------|------|------|
| GET | `/api/v1/commands` | 鍛戒护鍘嗗彶锛堟父鏍囧垎椤碉級 |
| GET | `/api/v1/commands/:id` | 鍗曟潯鍛戒护璇︽儏 |

---

## WebSocket 浜嬩欢 (Sprint 1锛屼粎 /device 鍛藉悕绌洪棿)

### Client 鈫?Server

| 浜嬩欢鍚?| 鍙戦€佹柟 | Payload | ACK |
|--------|--------|---------|-----|
| `device:register` | Desktop | `{ deviceId, name, platform }` | `WsResponse` |
| `device:heartbeat` | Desktop | `{ deviceId }` | - |
| `device:command:send` | Mobile | `{ targetDeviceId, type, action, timeout? }` | `{ commandId, status }` |
| `device:result:complete` | Desktop | `{ commandId, status, data?, error? }` | - |

### Server 鈫?Client

| 浜嬩欢鍚?| 鐩爣 | Payload |
|--------|------|---------|
| `device:command:execute` | `d-{deviceId}` | `DeviceCommandPayload` |
| `device:command:ack` | `u-{userId}` | `{ commandId, status }` |
| `device:result:delivered` | `u-{userId}` | `DeviceResultPayload` |
| `device:status:changed` | `u-{userId}` | `DeviceStatusPayload` |

---

## Sprint 1 涓嶅仛鐨勪簨

| 鍔熻兘 | 鍘熷洜 | 浣曟椂鍋?|
|------|------|--------|
| 濂藉弸绯荤粺 | 鎵嬫満鐩存帴鎺у埗鑷繁鐨勭數鑴戯紝涓嶉渶瑕佸ソ鍙?| Sprint 2 |
| 鑱婂ぉ娑堟伅 | Sprint 1 鍙仛璁惧鎺у埗 | Sprint 2 |
| 缇よ亰 / 棰戦亾 | 鍚屼笂 | Sprint 3 |
| AI (Draft / Whisper / Predictive) | Sprint 1 鐩存帴杞彂鍛戒护锛屼笉缁忚繃 LLM | Sprint 3 |
| Bot 妗嗘灦 | 璁惧鎺у埗鐩存帴璧?/device 鍛藉悕绌洪棿 | Sprint 2 |
| 鏂囦欢浼犺緭 | Sprint 1 鍙紶鏂囨湰鍛戒护鍜屾枃鏈粨鏋?| Sprint 4 |
| 鎺ㄩ€侀€氱煡 | Sprint 1 渚濊禆 WebSocket 瀹炴椂杩炴帴 | Sprint 4 |
| OpenClaw 闆嗘垚 | Sprint 1 鐢?child_process.exec | Sprint 2 |
| 鐢熶骇閮ㄧ讲 | Sprint 1 鍏ㄩ儴璺?localhost | Sprint 4 |

**鉁?Sprint 1 宸插畬鎴?* 鈫?杩涘叆 [Sprint 2](./sprint2_implement.md)
