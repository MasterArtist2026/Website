// Supabase Edge Function: blog-review
// Sends a Telegram message whenever the blog agent saves a new draft, with
// buttons to open it in the admin panel or publish it straight away.
//
// It answers two kinds of request:
//   1. A Database Webhook (INSERT on blog_posts) → sends the Telegram message
//   2. Telegram itself, when a button is pressed → asks to confirm, then publishes
//
// Deploy with:  supabase functions deploy blog-review --no-verify-jwt
// (Telegram can't send a Supabase key, so each request is checked here instead.)
//
// Secrets required (Supabase → Edge Functions → Secrets):
//   TELEGRAM_BOT_TOKEN      — from @BotFather
//   TELEGRAM_CHAT_ID        — your own chat id (the bot tells you it: send it /start)
//   TELEGRAM_WEBHOOK_SECRET — any long random string; also given to Telegram's setWebhook
//   DB_WEBHOOK_SECRET       — any long random string; also set as a header on the Database Webhook
// Optional:
//   GITHUB_TOKEN            — fine-grained token for MasterArtist2026/Website with "Contents: read and
//                             write"; lets a publish rebuild the static blog page at once
//                             instead of at the next hourly run
// Provided automatically: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const SITE = "https://masterartist.co";
const REPO = "MasterArtist2026/Website";
const env = (k: string) => Deno.env.get(k) ?? "";
const BOT = env("TELEGRAM_BOT_TOKEN");
const CHAT = env("TELEGRAM_CHAT_ID");

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ok = () => new Response("ok");

async function tg(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${BOT}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("Telegram", method, res.status, await res.text());
  return res;
}

async function db(path: string, init: RequestInit = {}) {
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
  });
}

async function getPost(id: string) {
  const res = await db(`blog_posts?id=eq.${encodeURIComponent(id)}&select=id,slug,title,excerpt,body_html,published`);
  const rows = res.ok ? await res.json() : [];
  return rows[0] ?? null;
}

const words = (h: string) => (h ?? "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const adminUrl = (slug: string) => `${SITE}/admin.html#blog/${slug}`;

function draftText(p: any, note = "") {
  return `<b>New blog draft to review</b>\n\n<b>${esc(p.title)}</b>\n${esc(p.excerpt)}\n\n` +
    `About ${words(p.body_html).toLocaleString("en")} words · ${SITE}/blog/${esc(p.slug)}.html once published` +
    (note ? `\n\n${note}` : "");
}
const reviewButtons = (p: any) => ({
  inline_keyboard: [
    [{ text: "Open in admin panel", url: adminUrl(p.slug) }],
    [{ text: "Publish now", callback_data: `p:${p.id}` }],
  ],
});

// 1. Database Webhook: a new draft was saved
async function onNewDraft(req: Request) {
  if (!env("DB_WEBHOOK_SECRET") || req.headers.get("x-webhook-secret") !== env("DB_WEBHOOK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const { type, record } = await req.json();
  if (type !== "INSERT" || !record || record.published) return ok();
  await tg("sendMessage", {
    chat_id: CHAT,
    text: draftText(record),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    reply_markup: reviewButtons(record),
  });
  return ok();
}

// 2. Telegram: a message or a button press
async function onTelegram(update: any) {
  // "/start" tells you your chat id, which goes in TELEGRAM_CHAT_ID
  if (update.message) {
    const chatId = String(update.message.chat?.id ?? "");
    if (!CHAT || chatId === CHAT) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: CHAT
          ? "You're set up. New blog drafts will arrive here."
          : `Your chat ID is ${chatId}. Save it as TELEGRAM_CHAT_ID in Supabase → Edge Functions → Secrets.`,
      });
    }
    return ok();
  }

  const q = update.callback_query;
  if (!q) return ok();
  const msg = q.message;
  // Only the owner's chat can press buttons
  if (!CHAT || String(msg?.chat?.id) !== CHAT || String(q.from?.id) !== CHAT) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Not allowed" });
    return ok();
  }
  const [action, id] = String(q.data ?? "").split(":");
  const p = id ? await getPost(id) : null;
  if (!p) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "That draft no longer exists" });
    return ok();
  }
  const edit = (text: string, reply_markup?: unknown) =>
    tg("editMessageText", {
      chat_id: msg.chat.id, message_id: msg.message_id, text, parse_mode: "HTML",
      link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}),
    });

  if (p.published) {
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Already published" });
    await edit(draftText(p, `Published. ${SITE}/post.html?slug=${esc(p.slug)}`));
    return ok();
  }

  if (action === "p") {            // first tap: ask to confirm
    await tg("answerCallbackQuery", { callback_query_id: q.id });
    await edit(draftText(p, "<b>Publish this post to the website?</b>"), {
      inline_keyboard: [[
        { text: "Yes, publish", callback_data: `c:${p.id}` },
        { text: "Cancel", callback_data: `x:${p.id}` },
      ]],
    });
  } else if (action === "x") {     // cancel: put the original buttons back
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Not published" });
    await edit(draftText(p), reviewButtons(p));
  } else if (action === "c") {     // confirmed: publish
    const res = await db("rpc/blog_publish_by_id", { method: "POST", body: JSON.stringify({ p_id: p.id }) });
    if (!res.ok) {
      console.error("publish failed", res.status, await res.text());
      await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Couldn't publish. Try the admin panel." });
      return ok();
    }
    await rebuildBlog();
    await tg("answerCallbackQuery", { callback_query_id: q.id, text: "Published" });
    await edit(draftText(p,
      `<b>Published.</b> It's on ${SITE}/blog.html now; its own page ` +
      `${SITE}/blog/${esc(p.slug)}.html appears within a few minutes.`));
  }
  return ok();
}

// Ask GitHub to rebuild the static blog pages now (optional)
async function rebuildBlog() {
  const token = env("GITHUB_TOKEN");
  if (!token) return;
  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "blog-review" },
    body: JSON.stringify({ event_type: "blog-published" }),
  });
  if (!res.ok) console.error("GitHub dispatch", res.status, await res.text());
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not found", { status: 404 });
  // (Telegram requests are let through without a chat id so /start can tell you yours)
  if (!BOT || (!CHAT && !req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new Response("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set", { status: 500 });
  }
  const tgSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (tgSecret !== null) {
    if (!env("TELEGRAM_WEBHOOK_SECRET") || tgSecret !== env("TELEGRAM_WEBHOOK_SECRET")) {
      return new Response("forbidden", { status: 403 });
    }
    try { return await onTelegram(await req.json()); }
    catch (e) { console.error(e); return ok(); }  // always 200, or Telegram retries forever
  }
  return onNewDraft(req);
});
