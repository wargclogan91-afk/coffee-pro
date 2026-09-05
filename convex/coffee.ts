import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const MINERS = [
  { id: "rookie-grinder", price: 50, rate: 0.001 },
  { id: "bronze-roaster", price: 120, rate: 0.003 },
  { id: "copper-percolator", price: 250, rate: 0.006 },
  { id: "steel-drip", price: 450, rate: 0.012 },
  { id: "iron-kettle", price: 800, rate: 0.022 },
  { id: "brass-brewer", price: 1400, rate: 0.04 },
  { id: "silver-espresso", price: 2500, rate: 0.075 },
  { id: "gold-filter", price: 4200, rate: 0.13 },
  { id: "platinum-press", price: 7000, rate: 0.22 },
  { id: "diamond-extractor", price: 12000, rate: 0.38 },
  { id: "obsidian-master", price: 20000, rate: 0.65 },
] as const;

function miner(id: string) {
  return MINERS.find((m) => m.id === id);
}

export const getPlayer = internalQuery({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) return null;

    const asset = await ctx.db
      .query("miningAssets")
      .withIndex("by_player_active", (q) =>
        q.eq("playerId", player._id).eq("active", true)
      )
      .first();

    const m = asset ? miner(asset.minerId) : null;

    return {
      telegramId: player.telegramId,
      username: player.username,
      firstName: player.firstName,
      balance: player.balance,
      claimedAt: player.claimedAt,
      starterActivated: player.starterActivated,
      totalReferrals: player.totalReferrals,
      verifiedReferrals: player.verifiedReferrals,
      walletAddress: player.walletAddress,
      activeMiner: asset && m
        ? {
            id: asset.minerId,
            price: m.price,
            rate: m.rate,
            expiresAt: asset.expiresAt,
            claimedAt: asset.claimedAt,
          }
        : null,
    };
  },
});

export const upsertPlayer = internalMutation({
  args: {
    telegramId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    referredBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (existing) {
      await ctx.db.patch("players", existing._id, {
        username: args.username,
        firstName: args.firstName,
      });

      return existing._id;
    }

    const referredBy =
      args.referredBy && args.referredBy !== args.telegramId
        ? args.referredBy
        : undefined;

    return await ctx.db.insert("players", {
      telegramId: args.telegramId,
      username: args.username,
      firstName: args.firstName,
      balance: 0,
      claimedAt: Date.now(),
      createdAt: Date.now(),
      starterActivated: false,
      referredBy,
      totalReferrals: 0,
      verifiedReferrals: 0,
    });
  },
});

export const activateStarter = internalMutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    if (player.starterActivated) {
      return player._id;
    }

    const now = Date.now();
    const starter = miner("rookie-grinder")!;

    await ctx.db.insert("miningAssets", {
      playerId: player._id,
      minerId: starter.id,
      purchasedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      claimedAt: now,
      active: true,
      starsPaid: 0,
    });

    await ctx.db.patch("players", player._id, {
      starterActivated: true,
      claimedAt: now,
    });

    if (player.referredBy) {
      const parent = await ctx.db
        .query("players")
        .withIndex("by_telegram", (q) =>
          q.eq("telegramId", player.referredBy!)
        )
        .unique();

      if (parent) {
        await ctx.db.patch("players", parent._id, {
          totalReferrals: parent.totalReferrals + 1,
          verifiedReferrals: parent.verifiedReferrals + 1,
        });
      }
    }

    return player._id;
  },
});

export const claimMining = internalMutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    const asset = await ctx.db
      .query("miningAssets")
      .withIndex("by_player_active", (q) =>
        q.eq("playerId", player._id).eq("active", true)
      )
      .first();

    if (!asset) throw new Error("NO_ACTIVE_MINER");

    const m = miner(asset.minerId);
    if (!m) throw new Error("MINER_NOT_FOUND");

    const now = Date.now();

    if (now >= asset.expiresAt) {
      await ctx.db.patch("miningAssets", asset._id, {
        active: false,
      });

      throw new Error("MINER_EXPIRED");
    }

    const elapsedMs = Math.min(
      now - asset.claimedAt,
      24 * 60 * 60 * 1000
    );

    const earned = (elapsedMs / 1000) * m.rate;

    await ctx.db.patch("players", player._id, {
      balance: player.balance + earned,
      claimedAt: now,
    });

    await ctx.db.patch("miningAssets", asset._id, {
      claimedAt: now,
    });

    return {
      earned,
      balance: player.balance + earned,
    };
  },
});

export const buyMiner = internalMutation({
  args: {
    telegramId: v.string(),
    minerId: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    const m = miner(args.minerId);
    if (!m) throw new Error("INVALID_MINER");

    const active = await ctx.db
      .query("miningAssets")
      .withIndex("by_player_active", (q) =>
        q.eq("playerId", player._id).eq("active", true)
      )
      .first();

    if (active) {
      throw new Error("ALREADY_HAS_ACTIVE_MINER");
    }

    if (player.balance < m.price) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    const now = Date.now();

    await ctx.db.patch("players", player._id, {
      balance: player.balance - m.price,
      claimedAt: now,
    });

    await ctx.db.insert("miningAssets", {
      playerId: player._id,
      minerId: m.id,
      purchasedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
      claimedAt: now,
      active: true,
      starsPaid: 0,
    });

    return {
      success: true,
      balance: player.balance - m.price,
      minerId: m.id,
    };
  },
});

export const setWallet = internalMutation({
  args: {
    telegramId: v.string(),
    walletAddress: v.string(),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    const wallet = args.walletAddress.trim();

    if (wallet.length < 20 || wallet.length > 150) {
      throw new Error("INVALID_WALLET");
    }

    await ctx.db.patch("players", player._id, {
      walletAddress: wallet,
    });

    return { success: true };
  },
});

export const requestWithdrawal = internalMutation({
  args: {
    telegramId: v.string(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("INVALID_AMOUNT");
    }

    if (args.amount < 1) {
      throw new Error("MINIMUM_WITHDRAWAL_IS_1");
    }

    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    if (!player.walletAddress) {
      throw new Error("WALLET_REQUIRED");
    }

    if (player.balance < args.amount) {
      throw new Error("INSUFFICIENT_BALANCE");
    }

    await ctx.db.patch("players", player._id, {
      balance: player.balance - args.amount,
    });

    await ctx.db.insert("withdrawals", {
      playerId: player._id,
      amount: args.amount,
      walletAddress: player.walletAddress,
      status: "pending",
      createdAt: Date.now(),
    });

    return {
      success: true,
      balance: player.balance - args.amount,
    };
  },
});

export const listWithdrawals = internalQuery({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) return [];

    return await ctx.db
      .query("withdrawals")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .order("desc")
      .take(50);
  },
});

export const claimReferralTask = internalMutation({
  args: { telegramId: v.string() },
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_telegram", (q) => q.eq("telegramId", args.telegramId))
      .unique();

    if (!player) throw new Error("PLAYER_NOT_FOUND");

    if (player.verifiedReferrals < 20) {
      throw new Error("NEED_20_VERIFIED_REFERRALS");
    }

    const old = await ctx.db
      .query("taskRewards")
      .withIndex("by_player_task", (q) =>
        q.eq("playerId", player._id).eq("taskId", "20-verified")
      )
      .first();

    if (old?.redeemedAt) {
      throw new Error("TASK_ALREADY_REDEEMED");
    }

    if (old) {
      await ctx.db.patch("taskRewards", old._id, {
        redeemedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("taskRewards", {
        playerId: player._id,
        taskId: "20-verified",
        claimedAt: Date.now(),
        redeemedAt: Date.now(),
      });
    }

    await ctx.db.patch("players", player._id, {
      balance: player.balance + 5,
      verifiedReferrals: player.verifiedReferrals - 20,
    });

    return {
      success: true,
      reward: 5,
      balance: player.balance + 5,
    };
  },
});
