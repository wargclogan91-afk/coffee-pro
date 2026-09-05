import { useEffect, useState } from "react";

type Tab = "mine" | "tasks" | "miners" | "friends" | "wallet";

const API = import.meta.env.VITE_CONVEX_SITE_URL;

const MINERS = [
  ["rookie-grinder", "Rookie Grinder", 50, 0.001],
  ["bronze-roaster", "Bronze Roaster", 120, 0.003],
  ["copper-percolator", "Copper Percolator", 250, 0.006],
  ["steel-drip", "Steel Drip", 450, 0.012],
  ["iron-kettle", "Iron Kettle", 800, 0.022],
  ["brass-brewer", "Brass Brewer", 1400, 0.04],
  ["silver-espresso", "Silver Espresso", 2500, 0.075],
  ["gold-filter", "Gold Filter", 4200, 0.13],
  ["platinum-press", "Platinum Press", 7000, 0.22],
  ["diamond-extractor", "Diamond Extractor", 12000, 0.38],
  ["obsidian-master", "Obsidian Master", 20000, 0.65],
] as const;

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        openTelegramLink?: (url: string) => void;
      };
    };
  }
}

async function api(path: string, method = "GET", body?: unknown) {
  const initData = window.Telegram?.WebApp?.initData || "";

  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Init-Data": initData,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }

  return data;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("mine");
  const [player, setPlayer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const auth = await api("/api/auth", "POST");

      if (auth?.player) {
        setPlayer(auth.player);
      }

      const data = await api("/api/player");
      setPlayer(data.player);
    } catch (e: any) {
      setMessage(e.message || "Telegram authentication required");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    load();
  }, []);

  async function activateStarter() {
    try {
      const data = await api("/api/activate-starter", "POST");
      setPlayer(data.player);
      setMessage("Starter activated ☕");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function claim() {
    try {
      const data = await api("/api/claim", "POST");
      setPlayer(data.player);
      setMessage(`+${Number(data.reward || 0).toFixed(6)} COFFEE`);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function buyMiner(minerId: string) {
    try {
      const data = await api("/api/buy-miner", "POST", { minerId });
      setPlayer(data.player);
      setMessage("Miner purchased successfully ☕");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function redeemTask() {
    try {
      const data = await api("/api/tasks/20-verified/redeem", "POST");
      setPlayer(data.player);
      setMessage(`Task reward: +${data.reward} COFFEE`);
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function saveWallet() {
    const wallet = prompt("Enter your TON wallet address:");
    if (!wallet) return;

    try {
      await api("/api/wallet", "POST", { walletAddress: wallet });
      const data = await api("/api/player");
      setPlayer(data.player);
      setMessage("Wallet saved");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  async function withdraw() {
    const amount = prompt("Amount of COFFEE to withdraw:");
    if (!amount) return;

    try {
      await api("/api/withdraw", "POST", {
        amount: Number(amount),
      });
      const data = await api("/api/player");
      setPlayer(data.player);
      setMessage("Withdrawal request created");
    } catch (e: any) {
      setMessage(e.message);
    }
  }

  if (loading) {
    return (
      <main className="app">
        <div className="loading">Loading Coffee PRO...</div>
      </main>
    );
  }

  const balance = Number(player?.balance || 0);
  const miner = player?.activeMiner;
  const referrals = Number(player?.verifiedReferrals || 0);

  return (
    <main className="app">
      <header className="topbar">
        <div>
          <div className="logo">☕ COFFEE PRO</div>
          <div className="subtitle">
            {player?.firstName
              ? `Welcome, ${player.firstName}`
              : "Telegram Mining"}
          </div>
        </div>
        <div className="balance">
          <span>COFFEE</span>
          <strong>{balance.toFixed(6)}</strong>
        </div>
      </header>

      {message && (
        <div className="toast" onClick={() => setMessage("")}>
          {message}
        </div>
      )}

      {!player?.starterActivated && (
        <section className="card starter">
          <h2>🎁 Free Starter Miner</h2>
          <p>Activate your free Rookie Grinder for 30 days.</p>
          <button onClick={activateStarter}>ACTIVATE</button>
        </section>
      )}

      {tab === "mine" && (
        <section>
          <div className="card mining-card">
            <div className="mine-icon">☕</div>
            <h1>{miner?.name || "No Active Miner"}</h1>

            {miner ? (
              <>
                <p className="rate">
                  {Number(miner.rate).toFixed(3)} COFFEE / sec
                </p>

                <button className="claim" onClick={claim}>
                  ⚡ CLAIM COFFEE
                </button>
              </>
            ) : (
              <p>Activate or purchase a miner to start mining.</p>
            )}
          </div>

          <div className="stats">
            <div className="card">
              <span>Balance</span>
              <strong>{balance.toFixed(4)}</strong>
            </div>

            <div className="card">
              <span>Referrals</span>
              <strong>{referrals}</strong>
            </div>
          </div>
        </section>
      )}

      {tab === "tasks" && (
        <section>
          <h2>Tasks</h2>

          <div className="card task">
            <div>
              <h3>👥 Invite 20 verified friends</h3>
              <p>{referrals} / 20 verified</p>
            </div>

            <button disabled={referrals < 20} onClick={redeemTask}>
              CLAIM 5
            </button>
          </div>
        </section>
      )}

      {tab === "miners" && (
        <section>
          <h2>Miners</h2>

          <div className="miners">
            {MINERS.map(([id, name, price, rate]) => (
              <div className="card miner" key={id}>
                <div>
                  <h3>⛏️ {name}</h3>
                  <p>{rate} COFFEE/sec</p>
                </div>

                <button onClick={() => buyMiner(id)}>
                  {price} ☕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "friends" && (
        <section>
          <h2>Friends</h2>

          <div className="card referral">
            <div className="big-number">{referrals}</div>
            <p>Verified referrals</p>

            <button
              onClick={() => {
                const id = player?.telegramId || "";
                const link = `https://t.me/your_bot?startapp=ref_${id}`;
                navigator.clipboard?.writeText(link);
                setMessage("Referral link copied");
              }}
            >
              🔗 COPY INVITE LINK
            </button>
          </div>
        </section>
      )}

      {tab === "wallet" && (
        <section>
          <h2>Wallet</h2>

          <div className="card wallet">
            <p>
              {player?.walletAddress
                ? player.walletAddress
                : "No wallet connected"}
            </p>

            <button onClick={saveWallet}>CONNECT TON WALLET</button>

            <button className="withdraw" onClick={withdraw}>
              WITHDRAW
            </button>
          </div>
        </section>
      )}

      <nav className="bottom-nav">
        <button onClick={() => setTab("mine")}>☕<span>Mine</span></button>
        <button onClick={() => setTab("tasks")}>🎯<span>Tasks</span></button>
        <button onClick={() => setTab("miners")}>⛏️<span>Miners</span></button>
        <button onClick={() => setTab("friends")}>👥<span>Friends</span></button>
        <button onClick={() => setTab("wallet")}>💎<span>Wallet</span></button>
      </nav>
    </main>
  );
}
