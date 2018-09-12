/**
 * Created by hvail on 2018/9/12.
 */

const express = require('express');
const request = require('request');

let _location = function (req, res, next) {
    next();
};
router.post('/', _location);

const router = express.Router();