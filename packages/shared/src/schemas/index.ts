export { registerSchema, loginSchema } from './user.schema';
export { deviceCommandSchema } from './device.schema';
export {
  agentConfigSchema,
  createBotSchema,
  updateBotSchema,
} from './bot.schema';
export type { AgentConfig, CreateBotInput, UpdateBotInput } from './bot.schema';
export {
  botNotificationMetadataSchema,
  botNotificationActionSchema,
} from './bot-notification.schema';
export type { BotNotificationMetadataInput } from './bot-notification.schema';
export {
  createGroupSchema,
  updateGroupSchema,
  addMembersSchema,
  updateMemberRoleSchema,
} from './group.schema';
export type {
  CreateGroupInput,
  UpdateGroupInput,
  AddMembersInput,
  UpdateMemberRoleInput,
} from './group.schema';
