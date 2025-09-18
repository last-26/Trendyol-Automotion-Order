function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function logInfo(message, data = '') {
    const timestamp = new Date().toLocaleString('tr-TR');
    console.log(`[${timestamp}] ℹ️ ${message}`, data);
  }
  
  function logError(message, error = '') {
    const timestamp = new Date().toLocaleString('tr-TR');
    console.error(`[${timestamp}] ❌ ${message}`, error);
  }
  
  function getCurrentTime() {
    return new Date().toISOString();
  }
  
  module.exports = { delay, logInfo, logError, getCurrentTime };