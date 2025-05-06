const axios = require('axios');

/**
 * Get pair information from a Solana DEX.
 * @param {string} chainId - The chain ID (e.g., 'solana').
 * @param {string} tokenAddress - The token address.
 * @returns {Promise<Object>} - The pair information.
 */
async function getPairInformation(chainId, tokenAddress) {
  try {
    const response = await axios.get(`https://api.example.com/pair-info?chainId=${chainId}&tokenAddress=${tokenAddress}`);
    return response.data;
  } catch (err) {
    throw new Error(`Failed to get pair information: ${err.message}`);
  }
}

/**
 * Get liquidity information for a token.
 * @param {string} tokenAddress - The token address.
 * @returns {Promise<Object>} - The liquidity information.
 */
async function getLiquidityInfo(tokenAddress) {
  try {
    const response = await axios.get(`https://api.example.com/liquidity-info?tokenAddress=${tokenAddress}`);
    return response.data;
  } catch (err) {
    throw new Error(`Failed to get liquidity information: ${err.message}`);
  }
}

module.exports = {
  getPairInformation,
  getLiquidityInfo
};
