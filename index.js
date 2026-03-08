import "dotenv/config";
import { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.ALLOWED_CHAT_ID;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.MODEL || "claude-sonnet-4-6";

if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!anthropicApiKey) throw new Error("Missing ANTHROPIC_API_KEY");

const MEMORY_FILE = "/var/data/memory.json";

function ensureMemoryFile() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.writeFileSync(MEMORY_FILE, JSON.stringify({ notes: [], today: [] }, null, 2));
    }
  } catch (err) {
    console.error("MEMORY INIT ERROR:", err);
  }
}

function readMemory() {
  try {
    ensureMemoryFile();
    const data = fs.readFileSync(MEMORY_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return { notes: [], today: [] };
  }
}

function writeMemory(memory) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
}

function formatMemoryForPrompt() {
  const memory = readMemory();
  const permanent = memory.notes?.length
    ? memory.notes.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "None";

  const today = memory.today?.length
    ? memory.today.map((n, i) => `${i + 1}. ${n}`).join("\n")
    : "None";

  return `Permanent memory:\n${permanent}\n\nToday's scratchpad:\n${today}`;
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
  const memoryContext = formatMemoryForPrompt();

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

Use Aaron's saved memory when it is relevant.
Be concise, structured, practical, and decisive.

${memoryContext}
`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 900,
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
    "Astor online.\nCommands: /ping /help /status /daily /ask /plan /think /remember /today /recall /clear /cleartoday"
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
/remember <permanent note>
/today <daily note>
/recall
/clear
/cleartoday`
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
  try {
    const text = ctx.message.text.replace(/^\/ask(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /ask <question>");

    await ctx.reply("Thinking...");
    const answer = await askClaude(text);
    await ctx.reply(answer);
  } catch (err) {
    console.error("ASK ERROR:", err);
    await ctx.reply("Astor hit an error on /ask.");
  }
});

bot.command("plan", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/plan(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /plan <goal>");

    await ctx.reply("Planning...");
    const prompt = `Create a practical plan for: ${text}

Format:
1. Objective
2. Best strategy
3. Immediate next 3 steps
4. Biggest risk
5. What Aaron should ignore`;
    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (err) {
    console.error("PLAN ERROR:", err);
    await ctx.reply("Astor hit an error on /plan.");
  }
});

bot.command("think", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/think(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /think <problem>");

    await ctx.reply("Thinking...");
    const prompt = `Think through this problem:

${text}

Provide:
- What is really going on
- Best move now
- What to avoid`;
    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (err) {
    console.error("THINK ERROR:", err);
    await ctx.reply("Astor hit an error on /think.");
  }
});

bot.command("remember", (ctx) => {
  const text = ctx.message.text.replace(/^\/remember(@\w+)?\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /remember <permanent note>");

  const memory = readMemory();
  memory.notes.push(text);
  writeMemory(memory);

  ctx.reply("Stored in permanent memory.");
});

bot.command("today", (ctx) => {
  const text = ctx.message.text.replace(/^\/today(@\w+)?\s*/, "").trim();
  if (!text) return ctx.reply("Usage: /today <daily note>");

  const memory = readMemory();
  memory.today.push(text);
  writeMemory(memory);

  ctx.reply("Stored in today's scratchpad.");
});

bot.command("recall", (ctx) => {
  const memory = readMemory();

  const permanent = memory.notes?.length
    ? memory.notes.map((note, i) => `${i + 1}. ${note}`).join("\n")
    : "None";

  const today = memory.today?.length
    ? memory.today.map((note, i) => `${i + 1}. ${note}`).join("\n")
    : "None";

  ctx.reply(`Permanent memory:\n${permanent}\n\nToday's scratchpad:\n${today}`);
});

bot.command("clear", (ctx) => {
  const memory = readMemory();
  memory.notes = [];
  writeMemory(memory);
  ctx.reply("Permanent memory cleared.");
});

bot.command("cleartoday", (ctx) => {
  const memory = readMemory();
  memory.today = [];
  writeMemory(memory);
  ctx.reply("Today's scratchpad cleared.");
});

ensureMemoryFile();

bot.launch().then(() => console.log("Astor started."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));