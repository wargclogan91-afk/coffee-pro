import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  players: defineTable({
    telegramId: v.string(),
    username: v.optional(v.string()),
    firstName: v.optional(v.string()),
    balance: v.number(),
    claimedAt: v.number(),
    createdAt: v.number(),
    starterActivated: v.boolean(),
    referredBy: v.optional(v.string()),
    totalReferrals: v.number(),
    verifiedReferrals: v.number(),
    walletAddress: v.optional(v.string()),
  })
    .index("by_telegram", ["telegramId"])
    .index("by_referrer", ["referredBy"]),

  miningAssets: defineTable({
    playerId: v.id("players"),
    minerId: v.string(),
    purchasedAt: v.number(),
    expiresAt: v.number(),
    claimedAt: v.number(),
    active: v.boolean(),
    starsPaid: v.optional(v.number()),
    paymentChargeId: v.optional(v.string()),
  })
    .index("by_player", ["playerId"])
    .index("by_player_active", ["playerId", "active"]),

  taskRewards: defineTable({
    playerId: v.id("players"),
    taskId: v.string(),
    claimedAt: v.optional(v.number()),
    redeemedAt: v.optional(v.number()),
  })
    .index("by_player_task", ["playerId", "taskId"]),

  withdrawals: defineTable({
    playerId: v.id("players"),
    amount: v.number(),
    walletAddress: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("rejected")
    ),
    createdAt: v.number(),
  })
    .index("by_player", ["playerId"])
    .index("by_status", ["status"]),
});
