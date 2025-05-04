// Interface DB pour stocker les utilisateurs
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Clés Redis
const USERS_HASH = 'cubi:users';
const WALLET_INDEX = 'cubi:wallets';

class Database {
  // Activer un utilisateur
  async activateUser(walletAddress, data) {
    const userId = `user:${walletAddress}`;
    const userData = {
      wallet: walletAddress,
      ...data,
      status: 'active',
      role: data.role || 'client',
      createdAt: data.createdAt || Date.now(),
      lastLogin: Date.now()
    };
    
    // Stocker l'utilisateur
    await redis.hset(USERS_HASH, userId, JSON.stringify(userData));
    // Indexer par wallet pour la recherche
    await redis.hset(WALLET_INDEX, walletAddress.toLowerCase(), userId);
    
    return userData;
  }

  // Vérifier si un wallet est activé
  async isWalletActive(walletAddress) {
    const userId = await redis.hget(WALLET_INDEX, walletAddress.toLowerCase());
    if (!userId) return false;
    
    const userData = await redis.hget(USERS_HASH, userId);
    if (!userData) return false;
    
    const user = JSON.parse(userData);
    return user.status === 'active';
  }

  // Récupérer les info d'un utilisateur
  async getUser(walletAddress) {
    const userId = await redis.hget(WALLET_INDEX, walletAddress.toLowerCase());
    if (!userId) return null;
    
    const userData = await redis.hget(USERS_HASH, userId);
    if (!userData) return null;
    
    return JSON.parse(userData);
  }

  // Lister tous les utilisateurs
  async listUsers(page = 1, limit = 20) {
    const users = await redis.hgetall(USERS_HASH);
    const userList = Object.entries(users).map(([key, value]) => ({
      id: key,
      ...JSON.parse(value)
    }));
    
    // Pagination
    const start = (page - 1) * limit;
    const end = start + limit;
    const paginatedUsers = userList.slice(start, end);
    
    return {
      users: paginatedUsers,
      total: userList.length,
      page,
      pages: Math.ceil(userList.length / limit)
    };
  }

  // Mettre à jour le dernier login
  async updateLastLogin(walletAddress) {
    const user = await this.getUser(walletAddress);
    if (!user) return null;
    
    user.lastLogin = Date.now();
    await this.activateUser(walletAddress, user);
    return user;
  }
}

module.exports = new Database();