/**
 * Created by hvail on 2018/9/4.
 */
let express = require('express');
let request = require('request');
let util = require('util');
let area = process.env.DATAAREA || "zh-cn";
let router = express.Router();

// const getWebhookUrl = `http://v3.manager-redis.server.${area}.sky1088.com/sales/unit-group-hooks/field/Event`;
const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Event`;

let getDemo = function (req, res, next) {
    res.send('alarm sms push system 1.2.0.0');
};

let Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/phone/";
let GetDeviceAlarmUrl = `http://v3.man.server.${area}.sky1088.com/custom/push-sms/field/BindTarget/`;

let doPostAlarm = function (req, res, next) {
    next();
};

/* GET users listing. */
router.post('/', doPostAlarm);

module.exports = router;