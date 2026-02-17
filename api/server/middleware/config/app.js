const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

const configMiddleware = async (req, res, next) => {
  try {
    const openidGroups = req.user?.openidGroups;
    req.config = await getAppConfig({ ...getAppConfigOptionsFromUser(req.user), openidGroups });
    req.configIsFallback = false;

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await getAppConfig({ tenantId: req.user?.tenantId });
      req.configIsFallback = true;
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

module.exports = configMiddleware;
