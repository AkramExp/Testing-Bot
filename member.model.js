import mongoose from "mongoose";

const MemberSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    discordName: String,
    joinedAt: Date,
}, { timestamps: true });

export default mongoose.models.Member || mongoose.model("Member", MemberSchema);
