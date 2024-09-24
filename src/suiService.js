import { JsonRpcProvider, Network, SUI_TYPE_ARG } from "@mysten/sui.js";

const provider = new JsonRpcProvider(Network.DEVNET); // Change to MAINNET if using production

// Function to subscribe to real-time transactions for a specific wallet
export async function subscribeToWalletTransactions(
  walletAddress,
  callback
) {
  try {
    const unsubscribe = provider.subscribeEvent(
      {
        MoveEvent: {
          sender: walletAddress, // Filter by wallet address
          type: "TransferObject", // Track transfer events
        },
      },
      async (event) => {
        // Extract relevant data from the event
        const transactionData = event?.move_event?.fields;

        if (transactionData) {
          console.log(
            `New transaction detected for wallet ${walletAddress}:`,
            transactionData
          );

          // Call the callback function to notify the bot
          callback(transactionData);
        }
      }
    );

    console.log(`Subscribed to transactions for wallet: ${walletAddress}`);
    return unsubscribe;
  } catch (error) {
    console.error("Error subscribing to wallet transactions:", error);
  }
}
