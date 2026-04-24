export class RelationshipResponseDto {
  id!: string;
  contactId!: string;
  tier!: string;
  label!: string | null;
  notes!: string | null;
  isMuted!: boolean;
  isUrgentReply!: boolean;
  lastInteractionAt!: string | null;
  weeklyMessageCount!: number;
  sentimentTrend!: string | null;
  lastKeyEventSummary!: string | null;
  recentEvents!: { type: string; summary: string }[];
}
