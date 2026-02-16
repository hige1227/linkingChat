import { BotType } from '@prisma/client';

/**
 * Bot 模板接口
 *
 * 用于定义系统默认 Bot 的完整配置。
 * 在用户注册时由 BotInitService 使用。
 */
export interface BotTemplate {
  name: string;
  description: string;
  type: BotType;
  isPinned: boolean;
  isDeletable: boolean;
  agentConfig: {
    systemPrompt: string;
    llmProvider: 'deepseek' | 'kimi';
    tools: string[];
  };
  welcomeMessage: string;
}

/**
 * 系统默认 Bot 模板列表
 *
 * 每个新注册用户都会自动获得这些 Bot。
 * 新增 Bot 只需在此数组追加即可，无需改动其他代码。
 */
export const DEFAULT_BOT_TEMPLATES: BotTemplate[] = [
  {
    name: 'Supervisor',
    description: '你的智能助手管家，通知汇总 + 调度中心',
    type: 'REMOTE_EXEC',
    isPinned: true,
    isDeletable: false,
    agentConfig: {
      systemPrompt:
        "You are Supervisor, the user's intelligent assistant manager. " +
        'You aggregate notifications from other bots and help the user manage tasks.',
      llmProvider: 'deepseek',
      tools: [],
    },
    welcomeMessage:
      '你好！我是 Supervisor，你的智能管家。有任何问题可以问我。',
  },
  {
    name: 'Coding Bot',
    description: '远程代码执行助手，连接你的桌面设备',
    type: 'REMOTE_EXEC',
    isPinned: true,
    isDeletable: false,
    agentConfig: {
      systemPrompt:
        'You are Coding Bot, a remote code execution assistant. ' +
        'Help the user execute commands on their desktop devices.',
      llmProvider: 'deepseek',
      tools: ['system.run', 'system.which'],
    },
    welcomeMessage:
      '你好！我是 Coding Bot。请先在桌面端登录以连接你的设备，然后你就可以通过我远程执行命令了。',
  },
];
