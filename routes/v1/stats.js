const express = require('express');

const adminAuth = require('../../middlewares/adminAuth');
const statsController = require('../../controllers/stats');

const statsRouter = express.Router();

statsRouter.get('/', adminAuth, statsController.all);

module.exports = statsRouter;
