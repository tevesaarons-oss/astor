import "dotenv/config";
import { Telegraf } from "telegraf";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import axios from "axios";
import cron from "node-cron";

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.ALLOWED_CHAT_ID;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.MODEL || "claude-sonnet-4-6";
const tavilyApiKey = process.env.TAVILY_API_KEY;

if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");
if (!anthropicApiKey) throw new Error("Missing ANTHROPIC_API_KEY");
if (!tavilyApiKey) throw new Error("Missing TAVILY_API_KEY");

const MEMORY_FILE = "/var/data/memory.json";

const DEFAULT_JOB_QUERY =
  'remote operations manager OR "operations specialist" OR "business operations" OR "revenue operations" OR "finance operations" OR "fp&a" remote jobs hiring now';

function ensureMemoryFile() {
  try {
    if (!fs.existsSync(MEMORY_FILE)) {
      fs.writeFileSync(
        MEMORY_FILE,
        JSON.stringify({ notes: [], today: [] }, null, 2)
      );
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

function getJobQuery() {
  const memory = readMemory();
  const custom = memory.notes.find((n) =>
    n.toLowerCase().startsWith("job query:")
  );
  if (custom) {
    return custom.replace(/^job query:\s*/i, "").trim();
  }
  return DEFAULT_JOB_QUERY;
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

Use Aaron's saved memory when relevant.
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

async function tavilySearch(query) {
  const response = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: tavilyApiKey,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 8,
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return response.data;
}

async function runJobAgent() {
  const query = getJobQuery();
  const data = await tavilySearch(query);

  const sources = (data.results || [])
    .map(
      (r, i) =>
        `${i + 1}. ${r.title || "No title"}\n${r.url || "No URL"}\n${
          r.content || "No summary"
        }`
    )
    .join("\n\n");

  const prompt = `
Aaron is looking for remote jobs.

Use these priorities:
- remote only
- global if possible
- operations / bizops / revops / finance ops / FP&A / similar
- ideally $1000+ monthly or strong probability of that range

Using the search findings below, return a clean digest.

Format exactly like this:

Astor Job Radar

1. Job Title — Company
Why relevant: ...
Link: ...

2. Job Title — Company
Why relevant: ...
Link: ...

3. Job Title — Company
Why relevant: ...
Link: ...

Then add:
Best next move: ...

Search findings:
${sources}
`;

  const answer = await askClaude(prompt);
  return answer;
}

bot.start((ctx) => {
  ctx.reply(
    "Astor online.\nCommands: /ping /help /status /daily /ask /plan /think /remember /today /recall /clear /cleartoday /search /research /agent /mission /jobscan /jobquery"
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
/cleartoday
/search <query>
/research <query>
/agent <mission>
/mission <objective>
/jobscan
/jobquery`
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

bot.command("search", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/search(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /search <query>");

    await ctx.reply("Searching...");
    const data = await tavilySearch(text);

    const answer = data.answer ? `Quick answer:\n${data.answer}\n\n` : "";
    const results = (data.results || [])
      .map(
        (r, i) =>
          `${i + 1}. ${r.title || "No title"}\n${r.url || "No URL"}\n${
            r.content || "No summary"
          }`
      )
      .join("\n\n");

    await ctx.reply((answer + "Sources:\n\n" + results).slice(0, 4000));
  } catch (err) {
    console.error("SEARCH ERROR:", err);
    await ctx.reply("Astor hit an error on /search.");
  }
});

bot.command("research", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/research(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /research <query>");

    await ctx.reply("Researching...");
    const data = await tavilySearch(text);

    const sources = (data.results || [])
      .map(
        (r, i) =>
          `${i + 1}. ${r.title || "No title"}\n${r.url || "No URL"}\n${
            r.content || "No summary"
          }`
      )
      .join("\n\n");

    const prompt = `Research this topic using the live search findings below.

Topic:
${text}

Search findings:
${sources}

Return:
1. What matters most
2. Best opportunities
3. Risks
4. Immediate next actions`;

    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (err) {
    console.error("RESEARCH ERROR:", err);
    await ctx.reply("Astor hit an error on /research.");
  }
});

bot.command("agent", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/agent(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /agent <mission>");

    await ctx.reply("Astor deploying agent...");

    const prompt = `
You are Astor's autonomous planning system.

Aaron wants an AI agent to execute this mission:

${text}

Return:

1. Mission definition
2. Execution steps
3. Tools required
4. Risks
5. Immediate next action
`;

    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (err) {
    console.error("AGENT ERROR:", err);
    await ctx.reply("Astor hit an error on /agent.");
  }
});

bot.command("mission", async (ctx) => {
  try {
    const text = ctx.message.text.replace(/^\/mission(@\w+)?\s*/, "").trim();
    if (!text) return ctx.reply("Usage: /mission <objective>");

    await ctx.reply("Astor initializing mission...");

    const prompt = `
Aaron is launching a mission:

${text}

You are an autonomous AI operator.

Return:

Mission Objective

Execution Plan
(step by step)

Immediate Actions (first 3)

Signals of Success

Risks
`;

    const answer = await askClaude(prompt);
    await ctx.reply(answer);
  } catch (err) {
    console.error("MISSION ERROR:", err);
    await ctx.reply("Astor hit an error on /mission.");
  }
});

bot.command("jobquery", (ctx) => {
  ctx.reply(`Current job query:\n\n${getJobQuery()}`);
});

bot.command("jobscan", async (ctx) => {
  try {
    await ctx.reply("Running Astor Job Radar...");
    const result = await runJobAgent();
    await ctx.reply(result.slice(0, 4000));
  } catch (err) {
    console.error("JOBSCAN ERROR:", err);
    await ctx.reply("Astor hit an error on /jobscan.");
  }
});

cron.schedule("0 */6 * * *", async () => {
  try {
    console.log("Running scheduled Job Agent...");
    const result = await runJobAgent();

    if (allowedChatId) {
      await bot.telegram.sendMessage(
        allowedChatId,
        `🔎 Astor Job Radar\n\n${result}`.slice(0, 4000)
      );
    }
  } catch (err) {
    console.error("SCHEDULED JOB AGENT ERROR:", err);
  }
});

ensureMemoryFile();

bot.launch().then(() => console.log("Astor started."));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));