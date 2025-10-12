import express from "express";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

let client; // global reference to avoid reconnecting every time
let isBotReady = false;

async function getClient() {
  if (!client) {
    client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    client.once("ready", () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      isBotReady = true;
    });

    console.log("⏳ Logging in to Discord...");
    await client.login(process.env.BOT_TOKEN);
  }

  // Wait until ready
  while (!isBotReady) {
    await new Promise((r) => setTimeout(r, 100));
  }

  return client;
}

app.post("/assign-player-role", async (req, res) => {
  const { discordId, action } = req.body;
  const ROLE_ID = "1419359929688657920";
  const GUILD_ID = process.env.GUILD_ID;

  try {
    const client = await getClient(); // ensure bot is ready
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(discordId);

    if (action === "add") {
      await member.roles.add(ROLE_ID);
      console.log(`✅ Role added to ${discordId}`);
    } else if (action === "remove") {
      await member.roles.remove(ROLE_ID);
      console.log(`🗑 Role removed from ${discordId}`);
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error assigning role:", err);
    res.status(500).json({ error: "Role assignment failed" });
  }
});

app.listen(3001, () => console.log("🌐 API running on port 3001"));
