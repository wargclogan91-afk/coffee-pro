import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Telegram-Init-Data",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });
}

async function verifyTelegram(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) throw new Error("INVALID_TELEGRAM_DATA");

  const authDate = Number(params.get("auth_date") || 0);

  if (!authDate || Date.now() / 1000 - authDate > 86400) {
    throw new Error("TELEGRAM_DATA_EXPIRED");
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const encoder = new TextEncoder();

  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(botToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const secret = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode("WebAppData")
  );

  const dataKey = await crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const calculated = await crypto.subtle.sign(
    "HMAC",
    dataKey,
    encoder.encode(dataCheckString)
  );

  const calculatedHex = Array.from(new Uint8Array(calculated))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (calculatedHex !== hash) {
    throw new Error("INVALID_TELEGRAM_SIGNATURE");
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    throw new Error("TELEGRAM_USER_MISSING");
  }

  const user = JSON.parse(userRaw);

  return {
    id: String(user.id),
    username: user.username ? String(user.username) : undefined,
    firstName: user.first_name ? String(user.first_name) : undefined,
    startParam: params.get("start_param") || undefined,
  };
}

async function auth(request: Request) {
  const initData = request.headers.get("X-Telegram-Init-Data");

  if (!initData) {
    throw new Error("TELEGRAM_INIT_DATA_REQUIRED");
  }

  return await verifyTelegram(initData);
}

async function handleGet(ctx: any, request: Request) {
  const path = new URL(request.url).pathname;

  if (path === "/api/health") {
    return json({ ok: true, service: "coffee-pro" });
  }

  const user = await auth(request);

  if (path === "/api/player") {
    const player = await ctx.runQuery(internal.coffee.getPlayer, {
      telegramId: user.id,
    });

    return json({ player });
  }

  if (path === "/api/withdrawals") {
    const withdrawals = await ctx.runQuery(
      internal.coffee.listWithdrawals,
      {
        telegramId: user.id,
      }
    );

    return json({ withdrawals });
  }

  return json({ error: "NOT_FOUND" }, 404);
}

async function handlePost(ctx: any, request: Request) {
  const path = new URL(request.url).pathname;

  const user = await auth(request);

  if (path === "/api/auth") {
    const referredBy =
      user.startParam?.startsWith("ref_")
        ? user.startParam.slice(4)
        : undefined;

    await ctx.runMutation(internal.coffee.upsertPlayer, {
      telegramId: user.id,
      username: user.username,
      firstName: user.firstName,
      referredBy,
    });

    const player = await ctx.runQuery(internal.coffee.getPlayer, {
      telegramId: user.id,
    });

    return json({ player });
  }

  if (path === "/api/activate-starter") {
    await ctx.runMutation(internal.coffee.activateStarter, {
      telegramId: user.id,
    });

    const player = await ctx.runQuery(internal.coffee.getPlayer, {
      telegramId: user.id,
    });

    return json({ player });
  }

  if (path === "/api/claim") {
    const result = await ctx.runMutation(internal.coffee.claimMining, {
      telegramId: user.id,
    });

    return json(result);
  }

  if (path === "/api/buy-miner") {
    const body = await request.json();

    const result = await ctx.runMutation(internal.coffee.buyMiner, {
      telegramId: user.id,
      minerId: String(body.minerId || ""),
    });

    return json(result);
  }

  if (path === "/api/wallet") {
    const body = await request.json();

    const result = await ctx.runMutation(internal.coffee.setWallet, {
      telegramId: user.id,
      walletAddress: String(body.walletAddress || ""),
    });

    return json(result);
  }

  if (path === "/api/withdraw") {
    const body = await request.json();

    const result = await ctx.runMutation(
      internal.coffee.requestWithdrawal,
      {
        telegramId: user.id,
        amount: Number(body.amount),
      }
    );

    return json(result);
  }

  if (path === "/api/tasks/20-verified/redeem") {
    const result = await ctx.runMutation(
      internal.coffee.claimReferralTask,
      {
        telegramId: user.id,
      }
    );

    return json(result);
  }

  return json({ error: "NOT_FOUND" }, 404);
}

const getHandler = httpAction(async (ctx, request) => {
  try {
    return await handleGet(ctx, request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SERVER_ERROR";

    return json({ error: message }, 400);
  }
});

const postHandler = httpAction(async (ctx, request) => {
  try {
    return await handlePost(ctx, request);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "SERVER_ERROR";

    return json({ error: message }, 400);
  }
});

const optionsHandler = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: cors,
  });
});

http.route({
  pathPrefix: "/api/",
  method: "OPTIONS",
  handler: optionsHandler,
});

http.route({
  pathPrefix: "/api/",
  method: "GET",
  handler: getHandler,
});

http.route({
  pathPrefix: "/api/",
  method: "POST",
  handler: postHandler,
});

export default http;
