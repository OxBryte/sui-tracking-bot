const { SuiClient, getFullnodeUrl } = require("@mysten/sui.js/client");
const { Telegraf } = require("telegraf");

// Configuration
const TELEGRAM_BOT_TOKEN = "7132353055:AAFhiI8o4Gp2eDjVudDCJC_2-mbq68ds7C0";
const NETWORK = "mainnet"; // or 'testnet', 'mainnet'
const WALLET_ADDRESS =
  "0x93b00137b8482bfcb95b4ff9c5e08bcb46fec9b106537372efb742b3eaa01715";

// Initialize Telegram Bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Initialize SUI client
const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

// Store the timestamp of the last processed transaction
let lastProcessedTimestamp = Date.now();

// Function to convert timestamp to readable date
function formatDate(timestamp) {
  const date = new Date(parseInt(timestamp));
  return date.toLocaleString(); // This will use the system's locale
}

// Function to check for new transactions
async function checkTransactions() {
  try {
    const transactions = await suiClient.queryTransactionBlocks({
      filter: {
        FromAddress: WALLET_ADDRESS,
      },
      options: {
        showInput: true,
        showEffects: true,
      },
    });

    // Filter and sort transactions
    const newTransactions = transactions.data
      .filter((tx) => parseInt(tx.timestampMs) > lastProcessedTimestamp)
      .sort((a, b) => parseInt(a.timestampMs) - parseInt(b.timestampMs));

    if (newTransactions.length > 0) {
      // Update the last processed timestamp
      lastProcessedTimestamp = parseInt(
        newTransactions[newTransactions.length - 1].timestampMs
      );
    }

    return newTransactions;
  } catch (error) {
    console.error("Error checking transactions:", error);
    return null;
  }
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

// Main loop to check for transactions
async function main(ctx) {
  while (true) {
    const newTransactions = await checkTransactions();
    if (newTransactions && newTransactions.length > 0) {
      for (const transaction of newTransactions) {
        const formattedTransaction = formatTransaction(transaction);
        await sendNotification(ctx, formattedTransaction);
      }
    }
    // Wait for 10 seconds before next check
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
}

bot.command("start", (ctx) => {
  ctx.reply(
    "Bot started. You will receive notifications for new transactions."
  );
  lastProcessedTimestamp = Date.now(); // Reset the timestamp when the bot starts
  main(ctx);
});

bot.launch();

console.log("Bot is running...");

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
