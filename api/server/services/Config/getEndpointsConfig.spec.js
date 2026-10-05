const mockCreateEndpointsConfigService = jest.fn();
const mockService = {
  getEndpointsConfig: jest.fn(),
  checkCapability: jest.fn(),
};

jest.mock('@librechat/api', () => ({
  createEndpointsConfigService: (...args) => mockCreateEndpointsConfigService(...args),
}));

jest.mock('./loadDefaultEConfig', () => jest.fn());
jest.mock('./app', () => ({
  getAppConfig: jest.fn(),
}));

const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const { getAppConfig } = require('./app');

describe('getEndpointsConfig service wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateEndpointsConfigService.mockReturnValue(mockService);
  });

  it('creates the shared endpoints config service with server dependencies', () => {
    const service = require('./getEndpointsConfig');

    expect(mockCreateEndpointsConfigService).toHaveBeenCalledWith({
      getAppConfig,
      loadDefaultEndpointsConfig,
    });
    expect(service).toEqual(mockService);
  });
});
