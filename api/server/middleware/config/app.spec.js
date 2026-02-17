jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('~/server/services/Config', () => ({
  getAppConfig: jest.fn(),
}));

const { logger } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config');
const configMiddleware = require('./app');

describe('config middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('passes role and openidGroups to getAppConfig', async () => {
    const config = { endpoints: {} };
    getAppConfig.mockResolvedValue(config);

    const req = {
      user: {
        role: 'USER',
        openidGroups: ['group-a', 'group-b'],
      },
      path: '/api/test',
    };
    const res = {};
    const next = jest.fn();

    await configMiddleware(req, res, next);

    expect(getAppConfig).toHaveBeenCalledWith({
      role: 'USER',
      openidGroups: ['group-a', 'group-b'],
    });
    expect(req.config).toBe(config);
    expect(req.configIsFallback).toBe(false);
    expect(next).toHaveBeenCalledWith();
  });

  test('falls back to base config when scoped config fails', async () => {
    const error = new Error('boom');
    const fallbackConfig = { endpoints: { openAI: {} } };
    getAppConfig.mockRejectedValueOnce(error).mockResolvedValueOnce(fallbackConfig);

    const req = {
      user: {
        role: 'USER',
        openidGroups: ['group-a'],
      },
      path: '/api/test',
    };
    const res = {};
    const next = jest.fn();

    await configMiddleware(req, res, next);

    expect(getAppConfig).toHaveBeenNthCalledWith(1, {
      role: 'USER',
      openidGroups: ['group-a'],
    });
    expect(getAppConfig).toHaveBeenNthCalledWith(2);
    expect(req.config).toBe(fallbackConfig);
    expect(req.configIsFallback).toBe(true);
    expect(logger.error).toHaveBeenCalledWith('Config middleware error:', {
      error: 'boom',
      userRole: 'USER',
      path: '/api/test',
    });
    expect(next).toHaveBeenCalledWith();
  });
});
