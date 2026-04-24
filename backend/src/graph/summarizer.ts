import { Ollama } from '@langchain/ollama';
import { ChatMessage } from './types';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

export async function runSummarizer(
  model: string,
  currentPlotContent: string,
  timespaceContent: string,
  messages: ChatMessage[]
): Promise<string> {
  const historyText = messages
    .map((m) => {
      const label = m.role === 'user' ? '【玩家】' : `【${m.speaker || 'AI'}】`;
      return `${label}: ${m.content}`;
    })
    .join('\n');

  const prompt = `你是故事記錄員。根據世界設定、當前劇情狀態與最近的對話，更新當前劇情狀態。

【世界設定】
${timespaceContent}

【目前的劇情狀態】
${currentPlotContent}

【最近發生的對話與事件】
${historyText}

請以結構化格式輸出更新後的當前劇情狀態，格式如下：

當前時間：（填入）
當前地點：（填入）
在場角色：（填入）
近期事件：
- （條列重要事件）
角色變化：
- （若有明顯的關係或情緒變化則條列，否則填「無」）

只輸出劇情狀態內容，不要加任何前綴或額外說明。`;

  const llm = new Ollama({ baseUrl: OLLAMA_BASE_URL, model, temperature: 0.3 });
  const response = await llm.invoke(prompt);
  return typeof response === 'string' ? response : (response.content as string);
}
