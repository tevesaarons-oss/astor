import "dotenv/config";
import { Telegraf } from "telegraf";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN");

const allowedChatId = process.env.ALLOWED_CHAT_ID; // e.g. -100xxxxxxxxxx

const bot = new Telegraf(token);

// --- LOCK FIRST: ignore everything not from your allowed chat (group) ---
bot.use(async (ctx, next) => {
  if (!allowedChatId) return next(); // if not set, bot works everywhere (temporary)
  const chatId = String(ctx.chat?.id ?? "");
  if (chatId !== String(allowedChatId)) return; // ignore silently
  return next();
});

// --- Commands ---
bot.start((ctx) => ctx.reply("Astor online. Use /daily, /status, /ping, /chatid"));
bot.command("help", (ctx) =>
  ctx.reply(["Commands:", "/daily", "/status", "/ping", "/chatid"].join("\n"))
);

bot.command("ping", (ctx) => ctx.reply("Alive."));

bot.command("status", (ctx) => {
  ctx.reply(
    [
      "Astor Weights:",
      "Job Hunt: 50%",
      "Platform Monitoring: 15%",
      "Telegram Assistant: 15%",
      "Content Experiments: 20%"
    ].join("\n")
  );
});

bot.command("daily", (ctx) => {
  ctx.reply(
    [
      "Astor /daily (v1):",
      "",
      "1) Job Hunt: Apply to 3 roles today. Follow up on 1 previous application.",
      "2) Platform: Write status + blockers + next actions.",
      "3) Assistant: Top 3 priorities + 1 distraction to kill.",
      "4) Content: Draft 2 hooks + 1 short script."
    ].join("\n")
  );
});

// Prints the current chat id (use this inside Astor HQ group)
bot.command("chatid", (ctx) => {
  ctx.reply(`chat id: ${ctx.chat.id}`);
});

// --- Launch ---
bot
  .launch()
  .then(() => console.log("Astor started (long polling)."))
  .catch((err) => console.error("Astor launch error:", err));

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));