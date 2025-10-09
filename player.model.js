import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
    discordName: {
        type: String,
        required: true,
        unique: true
    },
    discordId: {
        type: String,
        required: true,
        unique: true
    },
    member: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
        // required: true
    },
    currentTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        default: null
    },
    status: {
        type: String,
        enum: ['available', 'signed', 'cooldown'],
        default: 'available'
    },
    cooldownEnds: {
        type: Date,
        default: null
    },
    joinDate: {
        type: Date,
        default: null
    },
    releaseDate: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

export default mongoose.models.Player || mongoose.model('Player', playerSchema);

