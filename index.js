import "dotenv/config";
import { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.ALLOWED_CHAT_ID;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.MODEL;

const MEMORY_FILE = "./memory.json";

function readMemory() {
  try {
    const data = fs.readFileSync(MEMORY_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { notes: [] };
  }
}

function writeMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

const bot = new Telegraf(token);

const anthropic = new Anthropic({
  apiKey: anthropicApiKey,
});

bot.use(async (ctx, next) => {
  if (!allowedChatId) return next();
  const chatId = String(ctx.chat?.id ?? "");
  if (chatId !== String(allowedChatId)) return;
  return next();
});

async function askClaude(userPrompt) {
  const systemPrompt = `
You are Astor, Aaron's AI operator.

Your goals:
1. Increase Aaron's income probability
2. Improve focus and execution
3. Reduce distraction and scattered thinking
4. Give structured, practical answers

Current focus weights:
- Job Hunt: 50%
- Platform Monitoring: 15%
- Telegram Assistant: 15%
- Content Experiments: 20%

Be concise, structured, and practical.
`;

  const response = await anthropic.messages.create({
    model: model,
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

  return text || "No response.";
}

bot.start((ctx) => {
  ctx.reply(
    "Astor online.\nCommands: /ping /help /status /daily /ask /plan /think /remember /recall /clear"
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    `Commands:
/ping
/status
/daily
/ask <question>
/plan <goal>
/think <problem>
/remember <note>
/recall
/clear`
  );
});

bot.command("ping", (ctx) => ctx.reply("Alive."));

bot.command("status", (ctx) => {
  ctx.reply(
    `Astor Weights:
Job Hunt: 50%
Platform Monitoring: 15%
Telegram Assistant: 15%
Content Experiments: 20%`
  );
});

bot.command("daily", (ctx) => {
  ctx.reply(
    `Astor Daily Structure

1) Job Hunt
- Apply to 3 roles
- Follow up on 1 previous contact

2) Platform
- Identify the single blocker

3) Assistant
- Define top 3 priorities

4) Content
- 1 post documenting what you're building`
  );
});

bot.command("ask", async (ctx) => {
  const text = ctx.message.text.replace(/^\/ask\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /ask <question>");

  ctx.reply("Thinking...");
  const answer = await askClaude(text);
  ctx.reply(answer);
});

bot.command("plan", async (ctx) => {
  const text = ctx.message.text.replace(/^\/plan\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /plan <goal>");

  ctx.reply("Planning...");
  const prompt = `Create a practical plan for: ${text}

Format:
1. Objective
2. Best strategy
3. Immediate next 3 steps
4. Biggest risk
5. What Aaron should ignore`;
  const answer = await askClaude(prompt);
  ctx.reply(answer);
});

bot.command("think", async (ctx) => {
  const text = ctx.message.text.replace(/^\/think\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /think <problem>");

  ctx.reply("Thinking...");
  const prompt = `Think through this problem:

${text}

Provide:
- What is really going on
- Best move now
- What to avoid`;
  const answer = await askClaude(prompt);
  ctx.reply(answer);
});

bot.command("remember", (ctx) => {
  const text = ctx.message.text.replace(/^\/remember\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /remember <note>");

  const memory = readMemory();
  memory.notes.push(text);
  writeMemory(memory);

  ctx.reply("Stored.");
});

bot.command("recall", (ctx) => {
  const memory = readMemory();

  if (memory.notes.length === 0) {
    return ctx.reply("Memory empty.");
  }

  const notes = memory.notes
    .map((note, i) => `${i + 1}. ${note}`)
    .join("\n");

  ctx.reply(`Memory:\n\n${notes}`);
});

bot.command("clear", (ctx) => {
  writeMemory({ notes: [] });
  ctx.reply("Memory cleared.");
});

bot.launch().then(() => console.log("Astor started."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));