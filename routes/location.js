/**
 * Created by hvail on 2018/7/15.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const mongo = require('./../my_modules/mongo');

const express = require('express');
const router = express.Router();

const dbConfig = function (sn) {
    return {
        dbName: 'LocationResource',
        colName: `Location-${sn}`
    };
};

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

const _doPost = (req, res, next) => {
    next();
};

router.post('/', _doPost);

module.exports = router;