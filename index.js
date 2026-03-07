import "dotenv/config";
import { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const allowedChatId = process.env.ALLOWED_CHAT_ID;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.MODEL;

if (!anthropicApiKey) throw new Error("Missing ANTHROPIC_API_KEY");
if (!model) throw new Error("Missing MODEL");

const bot = new Telegraf(token);
const anthropic = new Anthropic({ apiKey: anthropicApiKey });

// Lock Astor to one chat/group if ALLOWED_CHAT_ID is set
bot.use(async (ctx, next) => {
  if (!allowedChatId) return next();
  const chatId = String(ctx.chat?.id ?? "");
  if (chatId !== String(allowedChatId)) return;
  return next();
});

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function askClaude(userPrompt) {
  const systemPrompt = `
You are Astor, Aaron's ruthless but useful AI operator.
Your priorities:
1. Increase Aaron's income probability
2. Improve focus and execution
3. Reduce distraction and scattered thinking
4. Give structured, practical answers
5. Be concise, clear, and decisive

Current weighting:
- Job Hunt: 50%
- Yappari multi-tenant platform monitoring: 15%
- AI Telegram assistant/system: 15%
- Content experiments: 20%

Behavior rules:
- Prefer practical action over theory
- Give concrete next steps
- Avoid fluff
- When useful, format output into short sections
- Speak like a sharp operator, not a motivational poster
`.trim();

  const response = await anthropic.messages.create({
    model,
    max_tokens: 700,
    temperature: 0.7,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: userPrompt,
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return text || "No response generated.";
}

bot.start((ctx) =>
  ctx.reply(
    "Astor online.\nCommands: /ping, /help, /status, /daily, /ask, /plan, /think, /chatid"
  )
);

bot.command("help", (ctx) =>
  ctx.reply(
    [
      "Astor commands:",
      "/ping - health check",
      "/status - current priorities",
      "/daily - non-AI daily structure",
      "/ask <question> - ask Astor anything",
      "/plan <goal> - get a practical plan",
      "/think <problem> - think through something",
      "/chatid - show current chat id",
    ].join("\n")
  )
);

bot.command("ping", (ctx) => ctx.reply("Alive."));

bot.command("chatid", (ctx) => {
  ctx.reply(`chat id: ${ctx.chat.id}`);
});

bot.command("status", (ctx) => {
  ctx.reply(
    [
      "Astor Weights:",
      "Job Hunt: 50%",
      "Platform Monitoring: 15%",
      "Telegram Assistant: 15%",
      "Content Experiments: 20%",
    ].join("\n")
  );
});

bot.command("daily", (ctx) => {
  ctx.reply(
    [
      "Astor /daily:",
      "",
      "1) Job Hunt: apply to 3 strong-fit roles and follow up on 1 old application.",
      "2) Platform: write blockers, next actions, and highest-leverage feature.",
      "3) Assistant: define top 3 priorities and kill 1 distraction.",
      "4) Content: draft 2 hooks and 1 monetizable angle.",
    ].join("\n")
  );
});

bot.command("ask", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/ask(@\w+)?\s*/i, "").trim();

    if (!text) {
      return ctx.reply("Usage: /ask <your question>");
    }

    await ctx.reply("Thinking...");
    const answer = await askClaude(text);
    await ctx.reply(answer);
  } catch (error) {
    console.error("ASK ERROR:", error);
    await ctx.reply("Astor hit an error on /ask.");
  }
});

bot.command("plan", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/plan(@\w+)?\s*/i, "").trim();

    if (!text) {
      return ctx.reply("Usage: /plan <goal>");
    }

    await ctx.reply("Planning...");
    const prompt = `Create a practical action plan for this goal:\n\n${text}\n\nFormat:\n1. Objective\n2. Best strategy\n3. Immediate next 3 steps\n4. Biggest risk\n5. What Aaron should ignore right now`;
    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (error) {
    console.error("PLAN ERROR:", error);
    await ctx.reply("Astor hit an error on /plan.");
  }
});

bot.command("think", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/think(@\w+)?\s*/i, "").trim();

    if (!text) {
      return ctx.reply("Usage: /think <problem>");
    }

    await ctx.reply("Thinking deeper...");
    const prompt = `Think through this problem carefully and give Aaron a sharp answer:\n\n${text}\n\nFormat:\n- What is really going on\n- Best interpretation\n- Best move now\n- What not to do`;
    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (error) {
    console.error("THINK ERROR:", error);
    await ctx.reply("Astor hit an error on /think.");
  }
});

bot.launch().then(() => console.log("Astor started (long polling)."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));