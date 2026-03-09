/// AI WebSocket event names — mirrors AI_EVENTS from @linkingchat/ws-protocol
class AiEvents {
  // Whisper
  static const whisperSuggestions = 'ai:whisper:suggestions';
  static const whisperRequest = 'ai:whisper:request';
  static const whisperAccept = 'ai:whisper:accept';

  // Draft & Verify
  static const draftCreated = 'ai:draft:created';
  static const draftApprove = 'ai:draft:approve';
  static const draftReject = 'ai:draft:reject';
  static const draftEdit = 'ai:draft:edit';
  static const draftExpired = 'ai:draft:expired';

  // Predictive Actions
  static const predictiveAction = 'ai:predictive:action';
  static const predictiveExecute = 'ai:predictive:execute';
  static const predictiveDismiss = 'ai:predictive:dismiss';

  /// Server→Client AI events to register on the socket
  static const serverToClientEvents = [
    whisperSuggestions,
    draftCreated,
    draftExpired,
    predictiveAction,
  ];
}
