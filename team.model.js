import mongoose from "mongoose";

const teamSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: true
    },
    viceCaptain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player',
        required: true
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

export default mongoose.models.Team || mongoose.model('Team', teamSchema);