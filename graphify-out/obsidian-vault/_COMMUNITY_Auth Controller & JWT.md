---
type: community
cohesion: 0.06
members: 47
---

# Auth Controller & JWT

**Cohesion:** 0.06 - loosely connected
**Members:** 47 nodes

## Members
- [[.constructor()_12]] - code - apps/server/src/auth/auth.controller.ts
- [[.constructor()_13]] - code - apps/server/src/auth/auth.service.ts
- [[.constructor()_14]] - code - apps/server/src/auth/strategies/jwt.strategy.ts
- [[.constructor()_16]] - code - apps/server/src/mail/mail.service.ts
- [[.forgotPassword()]] - code - apps/server/src/auth/auth.controller.ts
- [[.forgotPassword()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.generateTokenPair()]] - code - apps/server/src/auth/auth.service.ts
- [[.generateVerificationCode()]] - code - apps/server/src/auth/auth.service.ts
- [[.getInlineTemplate()]] - code - apps/server/src/mail/mail.service.ts
- [[.login()]] - code - apps/server/src/auth/auth.controller.ts
- [[.login()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.logout()]] - code - apps/server/src/auth/auth.controller.ts
- [[.logout()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.refresh()]] - code - apps/server/src/auth/auth.controller.ts
- [[.refresh()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.register()]] - code - apps/server/src/auth/auth.controller.ts
- [[.register()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.renderTemplate()]] - code - apps/server/src/mail/mail.service.ts
- [[.resendVerification()]] - code - apps/server/src/auth/auth.controller.ts
- [[.resendVerification()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.resetPassword()]] - code - apps/server/src/auth/auth.controller.ts
- [[.resetPassword()_1]] - code - apps/server/src/auth/auth.service.ts
- [[.sendPasswordResetEmail()]] - code - apps/server/src/mail/mail.service.ts
- [[.sendVerificationEmail()]] - code - apps/server/src/mail/mail.service.ts
- [[.storeRefreshToken()]] - code - apps/server/src/auth/auth.service.ts
- [[.validate()]] - code - apps/server/src/auth/strategies/jwt.strategy.ts
- [[.verifyEmail()]] - code - apps/server/src/auth/auth.controller.ts
- [[.verifyEmail()_1]] - code - apps/server/src/auth/auth.service.ts
- [[AuthController]] - code - apps/server/src/auth/auth.controller.ts
- [[AuthModule]] - code - apps/server/src/auth/auth.module.ts
- [[AuthService]] - code - apps/server/src/auth/auth.service.ts
- [[JwtStrategy]] - code - apps/server/src/auth/strategies/jwt.strategy.ts
- [[LoginDto]] - code - apps/server/src/auth/dto/login.dto.ts
- [[MailModule]] - code - apps/server/src/mail/mail.module.ts
- [[MailService]] - code - apps/server/src/mail/mail.service.ts
- [[RefreshDto]] - code - apps/server/src/auth/dto/refresh.dto.ts
- [[RegisterDto]] - code - apps/server/src/auth/dto/register.dto.ts
- [[auth.controller.ts]] - code - apps/server/src/auth/auth.controller.ts
- [[auth.module.ts]] - code - apps/server/src/auth/auth.module.ts
- [[auth.service.ts]] - code - apps/server/src/auth/auth.service.ts
- [[jwt.strategy.ts]] - code - apps/server/src/auth/strategies/jwt.strategy.ts
- [[login.dto.ts]] - code - apps/server/src/auth/dto/login.dto.ts
- [[mail.module.ts]] - code - apps/server/src/mail/mail.module.ts
- [[mail.service.spec.ts]] - code - apps/server/src/mail/__tests__/mail.service.spec.ts
- [[mail.service.ts]] - code - apps/server/src/mail/mail.service.ts
- [[refresh.dto.ts]] - code - apps/server/src/auth/dto/refresh.dto.ts
- [[register.dto.ts]] - code - apps/server/src/auth/dto/register.dto.ts

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Auth_Controller_&_JWT
SORT file.name ASC
```

## Connections to other communities
- 7 edges to [[_COMMUNITY_AI & Chat Server Core]]
- 2 edges to [[_COMMUNITY_NestJS App Bootstrap]]

## Top bridge nodes
- [[auth.module.ts]] - degree 7, connects to 2 communities
- [[auth.service.ts]] - degree 11, connects to 1 community
- [[auth.controller.ts]] - degree 7, connects to 1 community
- [[mail.service.ts]] - degree 5, connects to 1 community
- [[mail.module.ts]] - degree 4, connects to 1 community