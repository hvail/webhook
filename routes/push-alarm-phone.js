/**
 * Created by hvail on 2017/10/17.
 */
var express = require('express');
var request = require('request');
var util = require('util');
var myUtil = require('./../my_modules/utils');
var area = process.env.DATAAREA || "zh-cn";
var router = express.Router();

var Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/phone/";
var DeviceAttr = util.format("http://v3.local-manager-mongo.%s.sky1088.com/custom/device-attr/single/", area);
var GetPhoneNumber = util.format("http://v3.local-manager-redis.%s.sky1088.com/custom/account/single/", area);
var GetPhoneAlarmUrl = util.format("http://v3.local-manager-mongo.%s.sky1088.com/custom/push-phone/bind/", area);

// 接收到报警，开始推送判断
var _beginPush = function (bind, eve, display) {
    if (!bind.AlarmPhonePush) return;
    var date = new Date().getTime() / 1000;
    var _url = GetPhoneAlarmUrl + bind.UId + "/" + eve.SerialNumber;
    var url = GetPhoneNumber + bind.UId;
    request(_url, function (err, response, dat) {
        if (!dat) return;
        var data = JSON.parse(dat);
        var _eve = {};
        _eve.DisplayName = display;
        _eve.AlarmType = eve.EventType;
        _eve.EventTime = eve.UpTime;
        _eve.CallPhone = data.Phone;
        if (date > data.ExpireTime) return;
        // 判断成功，向语音报警系统发送报警请求
        _doPush(data.AlarmTarget, _eve);
    });
}

// 向后台发送语音报警请求
var _doPush = function (phone, eve) {
    var url = Trigger + phone;
    myUtil.DoPushPost(url, eve, function (url, data, success, result) {
        console.log(result + "=" + eve.AlarmType + ":" + url);
    });
    // request.Post(url, eve, function (result) {
    //     console.log(result + "=" + eve.AlarmType + ":" + url);
    // });
}

var getDemo = function (req, res, next) {
    res.send('alarm phone push system 1.0.0.0');
}

var doPostAlarm = function (req, res, next) {
    var data = req.body;
}

/* GET users listing. */
router.get('/', getDemo);
router.post('/', doPostAlarm);

module.exports = router;
