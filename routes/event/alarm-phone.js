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
const AlarmTypes = [4, 5, 6, 7, 8, 9, 14, 15, 16, 17, 18, 31, 38, 39, 46, 64, 65];

// 向后台发送语音报警请求
let _doPush = function (phoneBind, eve) {
    console.log("_doPush : " + JSON.stringify(phoneBind));
    let curr = Math.round(new Date().getTime() / 1000);
    if (phoneBind.ExpireTime < curr) {
        // console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警已经过期 最后时间 ${new Date(phoneBind.ExpireTime * 1000)}`);
        return;
        // } else if ((phoneBind.ExpireTime - 7 * 86400) < curr) {
        // console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警还有7天过期 最后时间 ${new Date(phoneBind.ExpireTime * 1000)}`);
    }
    // console.log(JSON.stringify(phoneBind));
    if (phoneBind.Status * 1 === 0) {
        // console.log(`${phoneBind.UId} @ ${phoneBind.BindTarget} 电话报警已经暂停 ${new Date(phoneBind.ExpireTime * 1000)}`);
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
            console.log(`${Trigger}${phoneBind.AlarmTarget}`);
            apiUtil.PromisePost(`${Trigger}${phoneBind.AlarmTarget}`, _eve)
                .then(e => {
                    if (e.length > 5) {
                        console.log(`${JSON.stringify(_eve)}`);
                        console.log(`push ${eve.SerialNumber}-${_eve.CallPhone} ${Trigger}${phoneBind.AlarmTarget}:${e}`);
                    }
                })
                .catch(err => console.log(err));
        })
        .catch(e => console.log(`报警出错 ${Trigger}${phoneBind.AlarmTarget} :: ${JSON.stringify(_eve)}`) && apiUtil.Break(e))
        .catch(console.log);
};

let getDemo = function (req, res, next) {
    res.send('alarm phone push system 1.0.0.0');
};

let doPostAlarm = function (req, res, next) {
    let eve = req.body;
    if (!Array.isArray(eve)) eve = [eve];
    if (eve.length) {
        console.log("event request phone alarm " + eve.length + " : " + JSON.stringify(eve));
        for (let i = 0; i < eve.length; i++) doEvent(eve[i]);
    } else {
        console.log("eve request phone alarm length is 0");
    }
    next();
};

let stop = (e) => {
    throw e;
};

let doEvent = function (eve) {
    if (!eve.AlarmType) eve.AlarmType = eve.EventType;
    if (!eve.SerialNumber) {
        console.log(JSON.stringify(eve));
        return;
    } else if (eve.SerialNumber.length < 16) {
        // console.log(JSON.stringify(eve));
    }
    if (AlarmTypes.indexOf(eve.AlarmType) < 0) {
        // console.log("Type : 不适合报警 , " + JSON.stringify(eve));
        return;
    }
    let DeviceAttrUrl = `${GetDeviceAlarmUrl}${eve.SerialNumber}`;
    // 查询此设备所对应的电话报警信息
    apiUtil.PromiseGet(DeviceAttrUrl).then(JSON.parse)
        .then(ds => {
            for (let i = 0; i < ds.length; i++) _doPush(ds[i], eve);
        })
        .catch(e => console.log('ERROR : ' + DeviceAttrUrl) && stop(e))
        .catch(console.log);
};

/* GET users listing. */
router.post('/', doPostAlarm);

module.exports = router;
