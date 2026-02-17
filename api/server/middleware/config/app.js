const { logger } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config');

const configMiddleware = async (req, res, next) => {
  try {
    const userRole = req.user?.role;
    const openidGroups = req.user?.openidGroups;
    req.config = await getAppConfig({ role: userRole, openidGroups });
    req.configIsFallback = false;

    next();
  } catch (error) {
    logger.error('Config middleware error:', {
      error: error.message,
      userRole: req.user?.role,
      path: req.path,
    });

    try {
      req.config = await getAppConfig();
      req.configIsFallback = true;
      next();
    } catch (fallbackError) {
      logger.error('Fallback config middleware error:', fallbackError);
      next(fallbackError);
    }
  }
};

module.exports = configMiddleware;
