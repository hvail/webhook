/***
 * 电话报警处理页面
 * Created by hvail on 2017/10/17.
 */
const express = require('express');
const request = require('request');
const util = require('util');
const api = require('api-base-hvail');
const apiUtil = api.util;
const myUtil = require('./../my_modules/utils');
const area = process.env.DATAAREA || "zh-cn";
const UIdPIX = area.replace("-", "").toUpperCase() + "_UId_";
const router = express.Router();
const Trigger = "http://v3.server-alarm.zh-cn.sky1088.com/alarm/phone/";
const GetDeviceAlarmUrl = `http://v3.man.server.${area}.sky1088.com/custom/alarm-phone/field/BindTarget/`;
const AlarmType = [4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 31, 38, 39, 46];

// 向后台发送语音报警请求
let _doPush = function (phoneBind, eve) {
    let curr = Math.round(new Date().getTime() / 1000);
    if (phoneBind.ExpireTime < curr) {
        console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警已经过期 最后时间 ${new Date(phoneBind.ExpireTime * 1000)}`);
        return;
    } else if ((phoneBind.ExpireTime - 7 * 86400) < curr) {
        console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警还有7天过期 最后时间 ${new Date(phoneBind.ExpireTime * 1000)}`);
    }
    console.log(JSON.stringify(phoneBind));
    if (phoneBind.Status && phoneBind.Status * 1 === 0) {
        console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警已经暂停 ${new Date(phoneBind.ExpireTime * 1000)}`);
        return;
    }
    let _eve = {
        DisplayName: phoneBind.BindTarget,
        AlarmType: eve.EventType,
        EventTime: eve.UpTime,
        CallPhone: phoneBind.Phone,
        CallAccount: UIdPIX + phoneBind.UId,
        SerialNumber: eve.SerialNumber
    };
    apiUtil.PromisePost(Trigger + phoneBind.AlarmTarget, _eve).catch(err => console.log(err));
};

let getDemo = function (req, res, next) {
    res.send('alarm phone push system 1.0.0.0');
};

let doPostAlarm = function (req, res, next) {
    let eve = req.body;
    if (eve.length)
        for (let i = 0; i < eve.length; i++) doEvent(eve[i]);
    res.status(200).send("1");
};

let doEvent = function (eve) {
    if (!eve.SerialNumber) return;
    if (AlarmType.indexOf(eve.EventType) < 0)  return;
    let DeviceAttrUrl = GetDeviceAlarmUrl + eve.SerialNumber;
    // 查询此设备所对应的电话报警信息
    request(DeviceAttrUrl, function (err, response, data) {
        if (data !== null && data !== "[]") {
            let ds = JSON.parse(data);
            for (let i = 0; i < ds.length; i++) _doPush(ds[i], eve);
        }
    });
};

/* GET users listing. */
router.get('/', getDemo);
router.post('/', doPostAlarm);

module.exports = router;
