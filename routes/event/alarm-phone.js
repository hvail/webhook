/***
 * 电话报警处理页面
 * Created by hvail on 2017/10/17.
 */
const express = require('express');
const request = require('request');
const util = require('util');
const api = require('api-base-hvail');
const apiUtil = api.util;
const area = process.env.DATAAREA || "zh-cn";
const UIdPIX = area.replace(/-/g, "").toUpperCase() + "_UId_";
const router = express.Router();
const Trigger = `http://push.core.sky1088.com/alarm/phone/`;
const GetDeviceAlarmUrl = `http://v3.man.server.${area}.sky1088.com/custom/alarm-phone/field/BindTarget/`;
const GetDeviceAttrUrl = `http://v3.man.server.${area}.sky1088.com/custom/device-attr/single/`;
const AlarmType = [4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 31, 38, 39, 46];

// 向后台发送语音报警请求
let _doPush = function (phoneBind, eve) {
    let curr = Math.round(new Date().getTime() / 1000);
    if (phoneBind.ExpireTime < curr) {
        return;
    }
    if (phoneBind.Status * 1 === 0) {
        console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警已经暂停 ${new Date(phoneBind.ExpireTime * 1000)}`);
        return;
    }

    let _eve = {
        DisplayName: phoneBind.BindTarget,
        AlarmType: eve.EventType,
        EventTime: eve.UpTime,
        CallPhone: phoneBind.Phone,
        CallAccount: UIdPIX + phoneBind.UId,
        SerialNumber: eve.SerialNumber,
        DataArea: area
    };
    apiUtil.PromiseGet(GetDeviceAttrUrl.concat(eve.SerialNumber)).then(JSON.parse)
        .then(attr => {
            if (attr.DisplayName) {
                _eve.DisplayName = attr.DisplayName;
            }
            console.log(`push message ${JSON.stringify(_eve)}`);
            apiUtil.PromisePost(`${Trigger}${phoneBind.AlarmTarget}?template=TTS_151231802`, _eve).catch(err => console.log(err));
        })
        .catch(e => console.log(`报警出错 ${Trigger}${phoneBind.AlarmTarget}?template=TTS_151231802 :: ${JSON.stringify(_eve)}`) && apiUtil.Break(e))
        .catch(console.log);
};

let getDemo = function (req, res, next) {
    res.send('alarm phone push system 1.0.0.0');
};

let doPostAlarm = function (req, res, next) {
    let eve = req.body;
    if (!Array.isArray(eve)) eve = [eve];
    if (eve.length)
        for (let i = 0; i < eve.length; i++) doEvent(eve[i]);
    next();
};

let stop = (e) => {
    throw e;
};

let doEvent = function (eve) {
    if (!eve.SerialNumber) return;
    if (AlarmType.indexOf(eve.EventType) < 0)  return;
    let DeviceAttrUrl = `${GetDeviceAlarmUrl}${eve.SerialNumber}`;
    // 查询此设备所对应的电话报警信息
    apiUtil.PromiseGet(DeviceAttrUrl).then(JSON.parse)
        .then(ds => {
            // (ds.length > 0) && console.log(ds);
            for (let i = 0; i < ds.length; i++) _doPush(ds[i], eve);
        })
        .catch(e => console.log('ERROR : ' + DeviceAttrUrl) && stop(e))
        .catch(console.log);
    // request(DeviceAttrUrl, function (err, response, data) {
    //     if (data !== null && data !== "[]") {
    //         let ds = JSON.parse(data);
    //         for (let i = 0; i < ds.length; i++) _doPush(ds[i], eve);
    //     }
    // });
};

/* GET users listing. */
router.post('/', doPostAlarm);

module.exports = router;
