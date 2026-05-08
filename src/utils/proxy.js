const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

function getProxyConfig() {
  const enabled = process.env.PROXY_ENABLED === 'true';
  
  if (!enabled) {
    return {};
  }
  
  const type = process.env.PROXY_TYPE || 'socks5';
  const host = process.env.PROXY_HOST;
  const port = process.env.PROXY_PORT;
  const username = process.env.PROXY_USERNAME;
  const password = process.env.PROXY_PASSWORD;
  
  if (!host || !port) {
    console.warn('[Proxy] Proxy enabled but host/port not configured');
    return {};
  }
  
  let proxyUrl = `${type}://`;
  
  if (username && password) {
    proxyUrl += `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
  }
  
  proxyUrl += `${host}:${port}`;
  
  try {
    let agent;
    if (type.startsWith('socks')) {
      agent = new SocksProxyAgent(proxyUrl);
    } else {
      agent = new HttpsProxyAgent(proxyUrl);
    }
    
    console.log(`[Proxy] Using proxy: ${type}://${host}:${port}`);
    
    return {
      httpAgent: agent,
      httpsAgent: agent
    };
  } catch (error) {
    console.error('[Proxy] Error configuring proxy:', error.message);
    return {};
  }
}

module.exports = {
  getProxyConfig
};
