// src/userModel.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  userId: { type: String, required: true, unique: true },
  wallets: [
    {
      name: { type: String, required: true },
      walletAddress: { type: String, required: true },
    },
  ],
});

const User = mongoose.model("User", userSchema);

module.exports = User;