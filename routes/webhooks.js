/***
 * Created by hvail on 2017/9/23.
 */
let express = require('express');
let request = require('request');
let router = express.Router();
let _util = require('./../my_modules/utils');
let util = require('util');
let area = process.env.DATAAREA || "zh-cn";
let redis = require('./../my_modules/redishelp');
const SetSendStatusTotalKey = "web-hook-send-total-";
const SetSendStatusSuccessKey = "web-hook-send-success-";
const SetSendStatusFailureKey = "web-hook-send-failure-";
const GetLastPositionUrl = "http://v3.res.server." + area + ".sky1088.com/track/single/";
const GetPushUrlByType = `http://v3.manager-redis.server.${area}.sky1088.com/sales/unit-group-hooks/field/`;

let __Demo_Class = {
    TargetUrl: _util.REQUIRED,
    TargetDevice: "0000000000000000",
    Listener: "GPSPosition"
};

let totalPush = function (url, data, status) {
    let ds = new Date().toISOString().split("T")[0];
    let totalKey = SetSendStatusTotalKey + ds;
    let statusKey = (status > 0 ? SetSendStatusSuccessKey : SetSendStatusFailureKey) + ds;
    redis.ZINCRBY(totalKey, 1, url);
    redis.ZINCRBY(statusKey, 1, url);
};

let doWebPush = function (arr, data) {
    for (let i = 0; i < arr.length; i++)
        for (let j = 0; j < data.length; j++) {
            _util.DoPushPost(arr[i], data[j], totalPush);
        }
};

// webHooks 信息存放于redis . 回执采用0 | 1
let _default = function (req, res, next) {
    res.send('v1.3.0.0');
};

let _requestPush = function (sn, type, cb) {
    request(`${GetPushUrlByType}${type}/${sn}`, function (err, response, result) {
        if (!result || result === "[]" || err) return;
        if (response.statusCode !== 200) {
            console.log(`${GetPushUrlByType}${type}/${sn} : ${response.statusCode}`);
            return;
        }
        let push = JSON.parse(result);
        cb && cb(push);
    });
}

let _location = function (req, res, next) {
    let pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    let _pos = [];
    for (let i = 0; i < pos.length; i++) {
        if (pos[i] && pos[i] !== "null") {
            _pos.push(pos[i]);
        }
    }
    if (_pos.length < 1) {
        res.send('-1');
        return;
    }
    pos = _pos;
    let sn = pos[0].SerialNumber;
    _requestPush(sn, "Position", function (push) {
        doWebPush(push, pos);
    });
    res.send("1");
};

let _power = function (req, res, next) {
    let pow = req.body;
    if (!pow) {
        res.send('0');
        return;
    }
    if (!util.isArray(pow)) {
        let _pow = [];
        _pow.push(pow);
        pow = _pow;
    }
    let sn = pow[0].SerialNumber;
    _requestPush(sn, "Power", function (push) {
        doWebPush(push, pow);
    });
    res.send("1");
};

let _event = function (req, res, next) {
    let eve = req.body;
    if (!eve) {
        res.send('0');
        return;
    }
    let sn = eve[0].SerialNumber;
    _requestPush(sn, "Event", function (push) {
        for (let i = 0; i < eve.length; i++) {
            if (!eve[i].AlarmType && eve[i].EventType) {
                eve[i].AlarmType = eve[i].EventType;
                eve[i].EventTime = eve[i].UpTime;
            }
        }
        doWebPush(push, eve);
    });
    // request(`${GetPushUrlByType}Event/${sn}`, function (err, response, resultUrl) {
    //     if (!resultUrl || err) return;
    //     if (response.statusCode !== 200) {
    //         console.log(`${GetPushUrlByType}Event/${sn} : ${response.statusCode}`);
    //         return;
    //     }
    //     resultUrl = resultUrl.split(',');
    //     request(GetLastPositionUrl + sn, function (err, response, position) {
    //         try {
    //             position = JSON.parse(position);
    //         } catch (e) {
    //             position = {};
    //         }
    //         for (let i = 0; i < eve.length; i++) {
    //             if (!eve[i].AlarmType && eve[i].EventType) {
    //                 eve[i].AlarmType = eve[i].EventType;
    //                 eve[i].EventTime = eve[i].UpTime;
    //             }
    //             if (position.GPSTime && Math.abs(position.GPSTime - eve[i].UpTime) < 60) {
    //                 eve[i].Lat = position.Lat;
    //                 eve[i].Lng = position.Lng;
    //                 eve[i].EventTime = eve[i].UpTime;
    //                 eve[i].Lat_Gg = position.Lat_Gg;
    //                 eve[i].Lat_Bd = position.Lat_Bd;
    //                 eve[i].Lng_Gg = position.Lng_Gg;
    //                 eve[i].Lng_Bd = position.Lng_Bd;
    //             }
    //             if (eve[i].AlarmType === 51) {
    //                 eve[i].Message = "指纹录入成功";
    //             }
    //         }
    //         doWebPush(resultUrl, eve);
    //     });
    // });
    res.send("1");
};

let _network = function (req, res, next) {
    let pow = req.body;
    if (!pow) {
        res.send('0');
        return;
    }
    if (!util.isArray(pow)) {
        let _pow = [];
        _pow.push(pow);
        pow = _pow;
    }
    let sn = pow[0].SerialNumber;
    _requestPush(sn, "Network", function (push) {
        doWebPush(push, pow);
    });
    // request(`${GetPushUrlByType}Network/${sn}`, function (err, response, resultUrl) {
    //     if (!resultUrl || err) return;
    //     if (response.statusCode !== 200) {
    //         console.log(`${GetPushUrlByType}Network/${sn} : ${response.statusCode}`);
    //         return;
    //     }
    //     resultUrl = resultUrl.split(',');
    //     doWebPush(resultUrl, pow);
    // });
    res.status(200).send('1');
};

/* GET users listing. */
router.get('/', _default);

// 发送各类型推送
router.post('/location', _location);
router.post('/power', _power);
router.post('/event', _event);
router.post('/network', _network);

module.exports = router;