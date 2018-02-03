/**
 * Created by hvail on 2017/10/17.
 */
let express = require('express');
let request = require('request');
let util = require('util');
let myUtil = require('./../my_modules/utils');
let area = process.env.DATAAREA || "zh-cn";
let router = express.Router();

let Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/phone/";
let DeviceAttr = util.format("http://v3.manager-mongo.server.%s.sky1088.com/custom/device-attr/single/", area);
let GetPhoneNumber = util.format("http://v3.manager-redis.server.%s.sky1088.com/custom/account/single/", area);
let GetPhoneAlarmUrl = `http://v3.manager-mongo.server.${area}.sky1088.com/custom/push-phone/bind/`;
let GetDeviceAlarmUrl = `http://v3.manager-mongo.server.${area}.sky1088.com/custom/push-phone/field/BindTarget/`;

// 接收到报警，开始推送判断
let _beginPush = function (bind, eve, display) {
    if (!bind.AlarmPhonePush) return;
    let date = new Date().getTime() / 1000;
    let _url = GetPhoneAlarmUrl + bind.UId + "/" + eve.SerialNumber;
    let url = GetPhoneNumber + bind.UId;
    request(_url, function (err, response, dat) {
        if (!dat) return;
        let data = JSON.parse(dat);
        let _eve = {};
        _eve.DisplayName = display;
        _eve.AlarmType = eve.EventType;
        _eve.EventTime = eve.UpTime;
        _eve.CallPhone = data.Phone;
        if (date > data.ExpireTime) return;
        // 判断成功，向语音报警系统发送报警请求
        _doPush(data.AlarmTarget, _eve);
    });
};

// 向后台发送语音报警请求
let _doPush = function (phone, eve) {
    let url = Trigger + phone;
    myUtil.DoPushPost(url, eve, function (url, data, success, result) {
        console.log(result + "=" + eve.AlarmType + ":" + url);
    });
};

let getDemo = function (req, res, next) {
    res.send('alarm phone push system 1.0.0.0');
};

let doPostAlarm = function (req, res, next) {
    let eve = req.body;
    if (eve.length)
        for (let i = 0; i < eve.length; i++) {
            doEvent(eve[i]);
        }
    else {
        console.log(eve);
    }
    res.status(200).send("1");
};

let doEvent = function (eve) {
    if (!eve.SerialNumber) return;
    let DeviceAttrUrl = GetDeviceAlarmUrl + eve.SerialNumber;
    // 查询此设备所对应的所有绑定信息
    // console.log(DeviceAttrUrl);
    request(DeviceAttrUrl, function (data) {
        if (data !== null) {
            console.log(data);
            // let _eve = {};
            // _eve.DisplayName = display;
            // _eve.AlarmType = eve.EventType;
            // _eve.EventTime = eve.UpTime;
            // _eve.CallPhone = data.Phone;
            // console.log(_eve);
            // if (date > data.ExpireTime) return;
            // 判断成功，向语音报警系统发送报警请求
            // _doPush(data.AlarmTarget, _eve);
        }
        // try {
        //     let data = JSON.parse(dat);
        //     let dn = data.DisplayName || data.SerialNumber;
        //     if (!data.Binds) return;
        //     for (let i = 0; i < data.Binds.length; i++) {
        //         beginPush(data.Binds[i], eve, dn);
        //     }
        // } catch (e) {
        //     console.log(e);
        // }
    });
};

/* GET users listing. */
router.get('/', getDemo);
router.post('/', doPostAlarm);

module.exports = router;
