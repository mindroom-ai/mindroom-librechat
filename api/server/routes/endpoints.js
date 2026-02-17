const express = require('express');
const endpointController = require('~/server/controllers/EndpointController');
const optionalJwtAuth = require('~/server/middleware/optionalJwtAuth');

const router = express.Router();
router.get('/', optionalJwtAuth, endpointController);

module.exports = router;
