const { SuiClient, getFullnodeUrl } = require("@mysten/sui.js/client");
const { Telegraf } = require("telegraf");
const mongoose = require("mongoose");
const User = require("./database");

// Configuration
const TELEGRAM_BOT_TOKEN = "7132353055:AAFhiI8o4Gp2eDjVudDCJC_2-mbq68ds7C0";
const NETWORK = "mainnet"; // or 'testnet', 'mainnet'

// MongoDB configuration
mongoose
  .connect(
    "mongodb+srv://silascyrax:vCobvP0diUOn8UQO@cluster0.hst0g.mongodb.net/",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 20000,
    }
  )
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Initialize Telegram Bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Initialize SUI client
const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

// Store the timestamp of the last processed transaction
let lastProcessedTimestamp = Date.now();

// Function to convert timestamp to readable date
function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp));
  return date.toLocaleString();
}

// Function to check for new transactions
async function checkTransactions(userWalletAddress) {
  if (userWalletAddress.length !== 32) {
    throw new Error(
      `Invalid wallet address length: ${userWalletAddress.length}`
    );
  }
  try {
    const response = await suiClient.getTransactions(userWalletAddress);
    return response.data; // Adjust based on your API response structure
  } catch (error) {
    console.error("Error checking transactions:", error);
    throw error; // Rethrow the error for further handling
  }

  // try {
  //   const transactions = await suiClient.queryTransactionBlocks({
  //     filter: {
  //       FromAddress: userWalletAddress,
  //     },
  //     options: {
  //       showInput: true,
  //       showEffects: true,
  //     },
  //   });

  //   // Filter and sort transactions
  //   const newTransactions = transactions.data
  //     .filter((tx) => parseInt(tx.timestampMs) > lastProcessedTimestamp)
  //     .sort((a, b) => parseInt(a.timestampMs) - parseInt(b.timestampMs));

  //   if (newTransactions.length > 0) {
  //     // Update the last processed timestamp
  //     lastProcessedTimestamp = parseInt(
  //       newTransactions[newTransactions.length - 1].timestampMs
  //     );
  //   }

  //   return newTransactions;
  // } catch (error) {
  //   console.error("Error checking transactions:", error);
  //   return null;
  // }
}

// Function to send notification
async function sendNotification(ctx, transaction) {
  const message = `
New transaction detected:
Hash: ${transaction.transactionHash}
Time: ${transaction.timestamp}
From: ${transaction.sender}
To: ${transaction.recipient || "N/A"}
Amount: ${transaction.amount || "N/A"}
Gas Used: ${transaction.gasUsed}
Status: ${transaction.status}
`;

  await ctx.reply(message);
}

// Function to format transaction data
function formatTransaction(transaction) {
  return {
    transactionHash: transaction.digest,
    timestamp: formatDate(transaction.timestampMs),
    sender: transaction.transaction?.data?.sender,
    recipient: transaction.effects?.transactions?.[0]?.recipient,
    amount: transaction.effects?.transactions?.[0]?.amount,
    gasUsed: transaction.effects?.gasUsed?.computationCost,
    status: transaction.effects?.status?.status,
  };
}

// Command to start the bot and save username
bot.command("start", async (ctx) => {
  const username = ctx.from.username || "N/A"; // Get Telegram username
  const userId = ctx.from.id; // Get Telegram user ID
  try {
    // Save username to MongoDB
    await mongoose.connection.collection("users").updateOne(
      { username: username },
      {
        $set: { userId: userId }, // Use $set operator for userId
        $setOnInsert: { username: username, wallets: [] }, // Only set on insert
      },
      { upsert: true }
    );
    ctx.reply(
      "Bot started. You will receive notifications for new transactions."
    );
    lastProcessedTimestamp = Date.now(); // Reset the timestamp when the bot starts
    main(ctx);
  } catch (error) {
    console.error("Error saving username to MongoDB:", error);
    ctx.reply("Failed to save your username. Please try again later.");
  }
});

// Command to add wallet
bot.command("add_wallet", async (ctx) => {
  const input = ctx.message.text.split(" ").slice(1);
  if (input.length < 2) {
    return ctx.reply("Please provide a name and a wallet address.");
  }
  const [name, walletAddress] = input;
  const userId = ctx.from.id || "N/A"; // Get Telegram username

  try {
    // Save wallet to MongoDB
    await mongoose.connection.collection("users").updateOne(
      { userId: userId },
      {
        $addToSet: { wallets: { name: name, walletAddress: walletAddress } },
      },
      { upsert: true }
    );

    ctx.reply(`Wallet added: ${name} - ${walletAddress}`);
    console.log(`Wallet added: ${name} - ${walletAddress}`);
  } catch (error) {
    console.error("Error saving wallet to MongoDB:", error);
    ctx.reply("Failed to add wallet. Please try again later.");
  }
});

// Handle messages that are not commands
bot.on("text", (ctx) => {
  const message = ctx.message.text;
  if (message.startsWith("/")) {
    // Ignore messages that start with a slash (commands)
    return;
  }
  ctx.reply(
    "Please use the command format: /add_wallet <name> <wallet_address>"
  );
});

// Command to list all wallets
bot.command("list_wallets", async (ctx) => {
  const userId = ctx.from.id || "N/A"; // Get Telegram username
  // return ctx.reply("Retrieving your wallets...");
  try {
    // Retrieve user data from MongoDB using the User model
    const user = await User.findOne({ userId: userId });

    if (user && user.wallets.length > 0) {
      const walletList = user.wallets
        .map((wallet) => `${wallet.name}: ${wallet.walletAddress}`)
        .join("\n");
      ctx.reply(`Your wallets:\n${walletList}`);
    } else {
      ctx.reply("You have no wallets added.");
    }
  } catch (error) {
    console.error("Error retrieving wallets from MongoDB:", error);
    ctx.reply("Failed to retrieve your wallets. Please try again later.");
  }
});

// Main loop to check for transactions
async function main(ctx) {
  const userId = ctx.from.id || "N/A"; // Get Telegram username
  try {
    // Retrieve user data from MongoDB using the User model
    const user = await User.findOne({ userId: userId });

    if (user && user.wallets.length > 0) {
      const walletAddresses = user.wallets.map(
        (wallet) => wallet.walletAddress
      );

      while (true) {
        for (const userWalletAddress of walletAddresses) {
          const newTransactions = await checkTransactions(userWalletAddress);
          if (newTransactions && newTransactions.length > 0) {
            for (const transaction of newTransactions) {
              const formattedTransaction = formatTransaction(transaction);
              await sendNotification(ctx, formattedTransaction);
            }
          }
        }
        // Wait for 10 seconds before next check
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } else {
      console.log("No wallets found for user.");
    }
  } catch (error) {
    console.error("Error retrieving wallets from MongoDB:", error);
  }
}

// Start the main loop when the bot is launched
bot.launch().then(() => {
  console.log("Bot is running...");
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
