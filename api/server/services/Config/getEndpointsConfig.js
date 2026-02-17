const { createEndpointsConfigService } = require('@librechat/api');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const getLogStores = require('~/cache/getLogStores');
const { getAppConfig } = require('./app');

const { getEndpointsConfig, checkCapability } = createEndpointsConfigService({
  getAppConfig,
  loadDefaultEndpointsConfig,
  getCache: getLogStores,
});

module.exports = { getEndpointsConfig, checkCapability };
