export function validateWalletAddress(address) {
  return /0x[a-fA-F0-9]{64}/.test(address);
}
