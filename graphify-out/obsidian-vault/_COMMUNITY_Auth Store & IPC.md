---
type: community
cohesion: 0.06
members: 56
---

# Auth Store & IPC

**Cohesion:** 0.06 - loosely connected
**Members:** 56 nodes

## Members
- [[.checkHealth()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.cleanup()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.clear()]] - code - apps/desktop/src/main/services/auth-store.service.ts
- [[.execute()]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[.executeViaOpenClaw()]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[.executeWithChildProcess()]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[.forceKill()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.getConnectionConfig()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.getMode()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.getStatus()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.gracefulShutdown()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.inferExitCode()]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[.isPortInUse()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.isProcessRunning()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.killSync()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.load()]] - code - apps/desktop/src/main/services/auth-store.service.ts
- [[.resolveMode()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.resolvePaths()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.rotateLogs()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.runAgentChat()]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[.save()]] - code - apps/desktop/src/main/services/auth-store.service.ts
- [[.setupLogStream()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.spawnProcess()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.start()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.stop()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.waitForHealth()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[.waitForWsReady()]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[AuthStore]] - code - apps/desktop/src/main/services/auth-store.service.ts
- [[CommandExecutor]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[OpenClawProcessService]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[auth-store.service.ts]] - code - apps/desktop/src/main/services/auth-store.service.ts
- [[auth.ipc.ts]] - code - apps/desktop/src/main/ipc/auth.ipc.ts
- [[command-blacklist.ts]] - code - apps/desktop/src/main/utils/command-blacklist.ts
- [[command-executor.service.ts]] - code - apps/desktop/src/main/services/command-executor.service.ts
- [[connectToGateway()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[connectViaDocker()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[connectViaProcess()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[createWindow()]] - code - apps/desktop/src/main/index.ts
- [[device.ipc.ts]] - code - apps/desktop/src/main/ipc/device.ipc.ts
- [[disconnectFromGateway()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[getDeviceId()]] - code - apps/desktop/src/main/utils/platform.ts
- [[getDeviceName()]] - code - apps/desktop/src/main/utils/platform.ts
- [[getPlatform()]] - code - apps/desktop/src/main/utils/platform.ts
- [[index.ts]] - code - apps/server/src/mentions/index.ts
- [[isDangerousCommand()]] - code - apps/desktop/src/main/utils/command-blacklist.ts
- [[notifyStatusChange()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[openclaw-client.service.ts]] - code - apps/desktop/src/main/services/openclaw-client.service.ts
- [[openclaw-process.service.ts]] - code - apps/desktop/src/main/services/openclaw-process.service.ts
- [[openclaw.ipc.ts]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[platform.ts]] - code - apps/desktop/src/main/utils/platform.ts
- [[refreshAndRetry()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[registerAuthIpc()]] - code - apps/desktop/src/main/ipc/auth.ipc.ts
- [[registerDeviceIpc()]] - code - apps/desktop/src/main/ipc/device.ipc.ts
- [[registerOpenClawIpc()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[restartGateway()]] - code - apps/desktop/src/main/ipc/openclaw.ipc.ts
- [[ws-client.service.ts]] - code - apps/desktop/src/main/services/ws-client.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Auth_Store_&_IPC
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_OpenClaw WS Client]]
- 1 edge to [[_COMMUNITY_Module Cluster 28]]
- 1 edge to [[_COMMUNITY_Desktop WS Client Service]]

## Top bridge nodes
- [[openclaw-client.service.ts]] - degree 5, connects to 2 communities
- [[ws-client.service.ts]] - degree 9, connects to 1 community