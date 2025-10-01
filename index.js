import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import mongoose from "mongoose";
import Member from "./member.model.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID;
const MONGODB_URI = process.env.MONGODB_URI;

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("MongoDB connection error:", err);
    }
}

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await connectDB();

    // Initial sync: store existing verified members
    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        await guild.members.fetch();

        const verifiedMembers = guild.members.cache.filter(m =>
            m.roles.cache.has(VERIFIED_ROLE_ID)
        );

        for (const member of verifiedMembers.values()) {
            await Member.findOneAndUpdate(
                { discordId: member.id },
                {
                    discordName: `${member.user.username}`,
                    joinedAt: member.joinedAt
                },
                { upsert: true, new: true }
            );
        }

        console.log("✅ Initial sync of verified members complete");
    } catch (err) {
        console.error("Error during initial sync:", err);
    }
});

// Event: Verified role added
client.on("guildMemberUpdate", async (oldMember, newMember) => {
    try {
        const hadRole = oldMember.roles.cache.has(VERIFIED_ROLE_ID);
        const hasRoleNow = newMember.roles.cache.has(VERIFIED_ROLE_ID);

        if (!hadRole && hasRoleNow) {
            await Member.findOneAndUpdate(
                { discordId: newMember.id },
                {
                    discordName: `${newMember.user.username}`,
                    joinedAt: newMember.joinedAt
                },
                { upsert: true, new: true }
            );

            console.log(`✅ New verified member stored: ${newMember.user.username}`);
        }
    } catch (err) {
        console.error("Error storing new verified member:", err);
    }
});

// Event: Member leaves server
client.on("guildMemberRemove", async (member) => {
    try {
        const removed = await Member.findOneAndDelete({ discordId: member.id });
        if (removed) {
            console.log(`🗑 Member removed from DB: ${member.user.username}`);
        }
    } catch (err) {
        console.error("Error removing member from DB:", err);
    }
});

client.on("userUpdate", async (oldUser, newUser) => {
    try {
        // Only update if username or discriminator changed
        if (
            oldUser.username !== newUser.username ||
            oldUser.discriminator !== newUser.discriminator
        ) {
            // Update in MongoDB for all records with this discordId
            const updated = await Member.findOneAndUpdate(
                { discordId: newUser.id },
                { discordName: `${newUser.username}` },
                { new: true }
            );

            if (updated) {
                console.log(
                    `✏️ Updated username in DB: ${oldUser.username} → ${newUser.username}`
                );
            }
        }
    } catch (err) {
        console.error("Error updating username in DB:", err);
    }
});

client.login(BOT_TOKEN);

const app = express();
app.use(bodyParser.json());
app.use(cors());

app.post("/assign-role", async (req, res) => {
    const { discordId, action } = req.body;
    const ROLE_ID = "1419359929688657920";

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (action === "add") {
            await member.roles.add(ROLE_ID);
            console.log(`✅ Role ${ROLE_ID} added to ${discordId}`);
        } else if (action === "remove") {
            await member.roles.remove(ROLE_ID);
            console.log(`🗑 Role ${ROLE_ID} removed from ${discordId}`);
        } else {
            return res.status(400).json({ error: "Invalid action. Use 'add' or 'remove'." });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Role update failed:", err);
        res.status(500).json({ error: "Failed to update role" });
    }
});

app.get("/", (req, res) => {
    res.status(200).send("Server is alive 🚀");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Bot API running on port ${PORT}`));
