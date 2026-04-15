---
type: community
cohesion: 0.29
members: 13
---

# Database Schema & Prisma

**Cohesion:** 0.29 - loosely connected
**Members:** 13 nodes

## Members
- [[.confirmUpload()]] - code - apps/server/src/upload/upload.service.ts
- [[.constructor()_41]] - code - apps/server/src/upload/upload.service.ts
- [[.deleteFile()]] - code - apps/server/src/upload/upload.service.ts
- [[.ensureBucket()]] - code - apps/server/src/upload/upload.service.ts
- [[.getCategoryFromKey()]] - code - apps/server/src/upload/upload.service.ts
- [[.getExtFromFilename()]] - code - apps/server/src/upload/upload.service.ts
- [[.getFileUrl()]] - code - apps/server/src/upload/upload.service.ts
- [[.getMaxSize()]] - code - apps/server/src/upload/upload.service.ts
- [[.presignUpload()]] - code - apps/server/src/upload/upload.service.ts
- [[.uploadBuffer()]] - code - apps/server/src/upload/upload.service.ts
- [[.uploadImage()]] - code - apps/server/src/upload/upload.service.ts
- [[.validateMimeType()]] - code - apps/server/src/upload/upload.service.ts
- [[UploadService]] - code - apps/server/src/upload/upload.service.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Database_Schema_&_Prisma
SORT file.name ASC
```

## Connections to other communities
- 1 edge to [[_COMMUNITY_AI & Chat Server Core]]

## Top bridge nodes
- [[UploadService]] - degree 13, connects to 1 community