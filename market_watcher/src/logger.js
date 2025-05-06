const fs = require('fs').promises;
const path = require('path');

const LOG_FILE = path.join(__dirname, 'logs.json');

/**
 * Log a debug message.
 * @param {string} message - The message to log.
 */
function debug(message) {
  console.debug(`[DEBUG] ${message}`);
}

/**
 * Log an info message.
 * @param {string} message - The message to log.
 */
function info(message) {
  console.info(`[INFO] ${message}`);
}

/**
 * Log an error message.
 * @param {string} message - The message to log.
 */
function error(message) {
  console.error(`[ERROR] ${message}`);
}

/**
 * Read logs from a file.
 * @returns {Promise<Array>} - The logs read from the file.
 */
async function readLogsFile() {
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // File does not exist, return an empty array
      return [];
    }
    throw err;
  }
}

/**
 * Add a log entry to the file.
 * @param {string} type - The type of log entry.
 * @param {Object} data - The data to log.
 */
async function addLogEntry(type, data) {
  const logs = await readLogsFile();
  logs.push({ type, data, timestamp: new Date().toISOString() });
  await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2));
}

module.exports = {
  debug,
  info,
  error,
  readLogsFile,
  addLogEntry
};
