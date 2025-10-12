import express from "express";
import bodyParser from "body-parser";
import cors from "cors";

import dotenv from "dotenv";
dotenv.config();

import { Client, GatewayIntentBits } from "discord.js";
import mongoose from "mongoose";
import Member from "./member.model.js";
import Player from "./player.model.js";
import Team from "./team.model.js";

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

const updatePlayerMemberReference = async (discordId, newMemberId, username) => {
    try {
        const currentPlayer = await Player.findOne({ discordId });

        if (!currentPlayer) {
            console.log(`⚠️ No player found for discordId: ${discordId}`);
            return null;
        }

        const oldMemberId = currentPlayer.member;


        const player = await Player.findOneAndUpdate(
            { discordId },
            { member: newMemberId, discordName: username },
            { new: true }
        ).populate("member");

        if (oldMemberId && oldMemberId.toString() !== newMemberId.toString()) {
            await Member.findByIdAndDelete(oldMemberId);
            console.log(`🗑 Deleted old member document: ${oldMemberId}`);
        }

        console.log(`🔗 Player updated with new member reference for ${discordId}`);
        return player;
    } catch (error) {
        console.error("Error updating player member reference:", error);
        throw error;
    }
};

console.log(client.isReady);

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

        // Run only when the verified role is newly added
        if (!hadRole && hasRoleNow) {
            // Step 1: Create or update Member document
            const memberDoc = await Member.findOneAndUpdate(
                { discordId: newMember.id },
                {
                    discordName: `${newMember.user.username}`,
                    joinedAt: newMember.joinedAt
                },
                { upsert: true, new: true }
            );

            console.log(`✅ New verified member stored: ${newMember.user.username}`);

            // Step 2: Update Player.member reference
            if (memberDoc?._id) {
                await updatePlayerMemberReference(newMember.id, memberDoc._id, newMember.user.username);
            }

            // Step 3: Fetch player by discordID (case-sensitive match!)
            const player = await Player.findOne({ discordId: newMember.id });
            if (!player) {
                console.log(`ℹ️ No player found for ${newMember.user.username}, skipping role assignment.`);
                return;
            }

            const guild = await client.guilds.fetch(GUILD_ID);
            const member = await guild.members.fetch(newMember.id);

            const PLAYER_ROLE_ID = "1419359929688657920";
            const CAPTAIN_ROLE_ID = "1409252277830549655";
            const VICE_CAPTAIN_ROLE_ID = "1419363127723560960";

            // Step 4: If player has a current team, get it
            if (!player.currentTeam) {
                console.log(`ℹ️ ${newMember.user.username} is not in a team (no currentTeam).`);
                return;
            }

            const team = await Team.findById(player.currentTeam);
            if (!team) {
                console.log(`⚠️ Team not found for player ${newMember.user.username}.`);
                return;
            }

            // Step 5: Assign roles based on team structure
            await member.roles.add(PLAYER_ROLE_ID);
            console.log(`🏅 Player role added to ${newMember.user.username}`);

            if (team.captain?.toString() === player._id.toString()) {
                await member.roles.add(CAPTAIN_ROLE_ID);
                console.log(`👑 Captain role added to ${newMember.user.username}`);
            }

            if (team.viceCaptain?.toString() === player._id.toString()) {
                await member.roles.add(VICE_CAPTAIN_ROLE_ID);
                console.log(`🎖 Vice Captain role added to ${newMember.user.username}`);
            }
        }
    } catch (err) {
        console.error("❌ Error handling verified member:", err);
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
        if (oldUser.username !== newUser.username) {
            // Update in MongoDB for all records with this discordId
            const updated = await Member.findOneAndUpdate(
                { discordId: newUser.id },
                { discordName: `${newUser.username}` },
                { new: true }
            );

            await Player.findOneAndUpdate({ discordId: newUser.id }, { discordName: newUser.username });

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

app.post("/assign-player-role", async (req, res) => {
    const { discordId, action } = req.body;
    const ROLE_ID = "1419359929688657920";

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (action === "add") {
            console.log("hello")
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

app.post("/assign-captain-role", async (req, res) => {
    const { discordId, action } = req.body;
    const CAPTAIN_ROLE_ID = "1409252277830549655";

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (action === "add") {
            await member.roles.add(CAPTAIN_ROLE_ID);
            console.log(`✅ Captain role added to ${discordId}`);
        } else if (action === "remove") {
            await member.roles.remove(CAPTAIN_ROLE_ID);
            console.log(`🗑 Captain role removed from ${discordId}`);
        } else {
            return res.status(400).json({ error: "Invalid action. Use 'add' or 'remove'." });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Captain role update failed:", err);
        res.status(500).json({ error: "Failed to update captain role" });
    }
});

// Add/Remove Team Vice Captain Role
app.post("/assign-vice-captain-role", async (req, res) => {
    const { discordId, action } = req.body;
    const VICE_CAPTAIN_ROLE_ID = "1419363127723560960";

    try {
        const guild = await client.guilds.fetch(GUILD_ID);
        const member = await guild.members.fetch(discordId);

        if (action === "add") {
            await member.roles.add(VICE_CAPTAIN_ROLE_ID);
            console.log(`✅ Vice Captain role added to ${discordId}`);
        } else if (action === "remove") {
            await member.roles.remove(VICE_CAPTAIN_ROLE_ID);
            console.log(`🗑 Vice Captain role removed from ${discordId}`);
        } else {
            return res.status(400).json({ error: "Invalid action. Use 'add' or 'remove'." });
        }

        res.json({ success: true });
    } catch (err) {
        console.error("❌ Vice Captain role update failed:", err);
        res.status(500).json({ error: "Failed to update vice captain role" });
    }
});

app.get("/", (req, res) => {
    res.status(200).send("Server is alive 🚀");
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 Bot API running on port ${PORT}`));
