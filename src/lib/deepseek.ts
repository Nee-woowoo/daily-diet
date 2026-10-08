import { failure, failureForStatus, type AiFailure, type MenuPrompt } from './ai';

/**
 * DeepSeek 那一层：只有 fetch、状态码映射和超时。所有能离线测的逻辑都在 `ai.ts`，这里薄到不值得
 * 单独写测试 —— 它唯一能验证的方式是真机发一次请求。
 *
 * **绝不打印任何敏感内容**：Key、prompt、请求体、响应体一个都不进日志。这里失败时返回的 `AiFailure`
 * 只带 kind 与状态码，异常对象也只用来判断「是不是超时/取消」，不往外抛 —— `fetch` 的错误里可能带
 * URL，带上 Authorization 头的请求对象一旦进了日志就洗不掉了。
 */

/**
 * 端点与模型名是常量，不做多服务商切换（见计划里的非目标）。
 *
 * ⚠️ 这两个字符串我**没能在本环境验证**：`api-docs.deepseek.com` 和 `docs.expo.dev` 一样被网络策略
 * 挡住，而请求体里的字段则按用户给的、且属于 OpenAI 兼容最小集的写法来 —— `model` / `messages` /
 * `max_tokens` / `temperature`。真机「测试连接」通过之前，这一段都算未验证。
 */
export const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/chat/completions';
export const DEEPSEEK_MODEL = 'deepseek-chat';

/** 一顿饭的 json（三道菜的步骤与食材）留足余量；超了会以 `truncated` 失败并让用户重试。 */
const MAX_TOKENS = 4096;

/** 超过这个时间就放弃。界面上写的是「通常 10–30 秒」，60 秒是给慢网络留的余地。 */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * 显式写 1，而不是省略：省略时默认值是多少我在这里验证不了，而 0 会让「重新生成」拿到一份和上一次
 * 一模一样的菜单。1 在任何合理的取值区间里都合法。
 */
const TEMPERATURE = 1;

/**
 * `response_format: { type: 'json_object' }` 我**没有**发出去。
 *
 * 它很可能是支持的（用户也说了「OpenAI 兼容格式」），但这里验证不了：真要是 400，整个功能就挂掉，
 * 而严格 json 靠 prompt 里的输出契约 + `extractJson` 的容错解析已经能拿到。真机「测试连接」通过
 * 之后想打开，改这一个常量即可 —— 那时 prompt 里已经写着小写的 `json`（JSON 模式的前置要求）。
 */
const USE_JSON_MODE = false;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export type AiCallResult = { ok: true; content: string } | { ok: false; failure: AiFailure };
export type AiTestResult = { ok: true; ms: number } | { ok: false; failure: AiFailure };

/** 只取我们要用的两个字段；响应体的其余部分一律不看、不记。 */
interface ChatResponse {
  choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
}

interface RawResult {
  ok: true;
  content: string;
  finishReason: unknown;
}

async function request(
  apiKey: string,
  messages: ChatMessage[],
  maxTokens: number,
  externalSignal?: AbortSignal,
): Promise<RawResult | { ok: false; failure: AiFailure }> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  // 用户点「取消」时中止这一次请求。外部 signal 与超时共用一个 controller，两者不会互相覆盖：
  // 谁先 abort，谁就在下面决定报哪个 kind。
  const forwardAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', forwardAbort);

  try {
    const body: Record<string, unknown> = {
      model: DEEPSEEK_MODEL,
      messages,
      max_tokens: maxTokens,
      temperature: TEMPERATURE,
    };
    if (USE_JSON_MODE) body.response_format = { type: 'json_object' };

    const response = await fetch(DEEPSEEK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, failure: failureForStatus(response.status) };

    let data: ChatResponse;
    try {
      data = (await response.json()) as ChatResponse;
    } catch {
      return { ok: false, failure: failure('parse', '响应不是 JSON') };
    }

    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    return {
      ok: true,
      content: typeof content === 'string' ? content : '',
      finishReason: choice?.finish_reason,
    };
  } catch {
    if (timedOut) return { ok: false, failure: failure('timeout') };
    if (externalSignal?.aborted) return { ok: false, failure: failure('cancelled') };
    return { ok: false, failure: failure('network') };
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', forwardAbort);
  }
}

/** 生成一份菜单。**每次调用只发一次请求**，失败就是失败，重试由用户点。 */
export async function callDeepSeek(
  apiKey: string,
  prompt: MenuPrompt,
  externalSignal?: AbortSignal,
): Promise<AiCallResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: prompt.system },
    { role: 'user', content: prompt.user },
  ];
  const result = await request(apiKey, messages, MAX_TOKENS, externalSignal);
  if (!result.ok) return result;

  // 截断先于空内容判：截断的响应往往还留着一小段，报「输出被截断」比报「没有返回内容」有用。
  if (result.finishReason === 'length') return { ok: false, failure: failure('truncated') };
  if (result.content.trim().length === 0) return { ok: false, failure: failure('empty') };
  return { ok: true, content: result.content };
}

/**
 * 「测试连接」：发一条最短的请求，只看成败与时延。
 *
 * 用 `max_tokens: 1` 的对话请求而不是 `GET /models`：用户要的就是「验证 key 能不能用」，而这条路径
 * 与真正生成菜单走的是同一个端点、同一套鉴权 —— 它成功就意味着生成也能通。代价是它会用掉一个
 * token（可以忽略）。
 *
 * 因此这里**不**做截断/空内容的判断：`max_tokens: 1` 本来就必然截断。
 */
export async function testConnection(
  apiKey: string,
  externalSignal?: AbortSignal,
): Promise<AiTestResult> {
  const startedAt = Date.now();
  const result = await request(apiKey, [{ role: 'user', content: 'ping' }], 1, externalSignal);
  if (!result.ok) return result;
  return { ok: true, ms: Date.now() - startedAt };
}
