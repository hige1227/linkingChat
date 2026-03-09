## Summary

<!-- 1-3 bullet points describing what this PR does -->

## Test Plan

<!-- How was this tested? -->

---

## WS Event Checklist

> Fill this section if your PR adds or modifies WebSocket events. Delete if not applicable.

- [ ] Server emit uses `/chat` namespace methods (`chatListcast`/`chatUnicast`/`toRoom`)
- [ ] Payload matches type definition in `packages/ws-protocol`
- [ ] Payload zod schema updated in `packages/ws-protocol/src/validators.ts` (if fields changed)
- [ ] Desktop `useChatSocket.ts` has handler
- [ ] Mobile `chat_socket_service.dart` or provider has handler
- [ ] Integration test added (if new event)
- [ ] `pnpm check-ws-coverage` passes (if script available)
