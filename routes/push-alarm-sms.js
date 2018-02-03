/**
 * 短信报警处理程序
 * Created by hvail on 2018/2/2.
 */
let express = require('express');
let request = require('request');
let util = require('util');
let myUtil = require('./../my_modules/utils');
let area = process.env.DATAAREA || "zh-cn";
let router = express.Router();

let Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/sms/";
let DeviceAttr = `http://v3.manager-mongo.server.${area}.sky1088.com/custom/device-attr/single/`;
let GetPhoneNumber = `http://v3.manager-redis.server.${area}.sky1088.com/custom/account/single/`;
let GetPhoneAlarmUrl = `http://v3.manager-mongo.server.${area}.sky1088.com/custom/push-phone/bind/`;


/* GET users listing. */
router.get('/', getDemo);
router.post('/', doPostAlarm);

module.exports = router;