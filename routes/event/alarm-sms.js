/**
 * 短信报警处理程序
 * Created by hvail on 2018/2/2.
 */
let express = require('express');
let request = require('request');
let util = require('util');
let area = process.env.DATAAREA || "zh-cn";
let router = express.Router();

let getDemo = function (req, res, next) {
    res.send('alarm sms push system 1.1.0.0');
};

let Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/phone/";
let GetDeviceAlarmUrl = `http://v3.man.server.${area}.sky1088.com/custom/push-sms/field/BindTarget/`;

let doPostAlarm = function (req, res, next) {
    // let eve = req.body;
    // console.log("alarm-sms");
    // console.log(JSON.stringify(eve));
    next();
};

/* GET users listing. */
router.post('/', doPostAlarm);

module.exports = router;