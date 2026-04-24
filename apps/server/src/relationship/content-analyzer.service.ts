import { Injectable, Logger } from '@nestjs/common';
import { LlmConfigService } from '../ai/llm-config.service';

export interface ExtractedEvent {
  type: 'life_event' | 'commitment' | 'emotional' | 'milestone';
  summary: string;
  sourceMessageId?: string;
}

const LIFE_KEYWORDS = [
  '住院',
  '手术',
  '去世',
  '离职',
  '结婚',
  '生孩子',
  '怀孕',
  '毕业',
  '搬家',
  '分手',
  '离婚',
];

const COMMITMENT_KEYWORDS = ['我答应', '我保证', '我一定', '下次请你', '我请你'];

const EXTRACT_SYSTEM_PROMPT = `你是关系事件提取器。分析聊天消息，提取重要关系事件。
返回 JSON 数组，格式：[{"type": "life_event|commitment|emotional|milestone", "summary": "简短描述"}]
无事件则返回 []。只返回 JSON。`;

@Injectable()
export class ContentAnalyzerService {
  private readonly logger = new Logger(ContentAnalyzerService.name);

  constructor(private readonly llmConfig: LlmConfigService) {}

  ruleFilter(content: string): boolean {
    if (!content || content.trim().length < 8) return false;
    if (/^[\p{Emoji}\s]+$/u.test(content.trim())) return false;
    if (LIFE_KEYWORDS.some((kw) => content.includes(kw))) return true;
    if (COMMITMENT_KEYWORDS.some((kw) => content.includes(kw))) return true;
    if (/[!！]{2,}/.test(content)) return true;
    return false;
  }

  async extractEvents(content: string, messageId: string): Promise<ExtractedEvent[]> {
    const text = await this.llmConfig.completeText(
      'complex_analysis',
      EXTRACT_SYSTEM_PROMPT,
      content,
      { maxTokens: 256 },
    );

    if (!text) return [];

    try {
      const cleaned = text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const parsed = JSON.parse(cleaned) as ExtractedEvent[];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((e) => ({ ...e, sourceMessageId: messageId }));
    } catch {
      this.logger.warn(`Failed to parse event extraction: ${text.substring(0, 80)}`);
      return [];
    }
  }
}
