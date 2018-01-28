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
const HashWebHooks = "web-hook-listener-hash-";
const SetSendStatusTotalKey = "web-hook-send-total-";
const SetSendStatusSuccessKey = "web-hook-send-success-";
const SetSendStatusFailureKey = "web-hook-send-failure-";
const GetLastPositionUrl = "http://v3.res.server." + area + ".sky1088.com/track/single/";

let __Demo_Class = {
    TargetUrl: _util.REQUIRED,
    TargetDevice: "0000000000000000",
    Listener: "GPSPosition"
};

// key = Listener+TargetDevice
let getWebHooks = function (sn, lis, cb) {
    let key_a = "0000000000000000";
    let key_b = sn.substring(0, 6) + "0000000000";
    redis.HMGET(HashWebHooks + lis, key_a, key_b, sn, function (err, data) {
        let arr = [];
        for (let i = 2; i > -1; i--) {
            if (!!data[i] || data[i] === 'null') arr.push(data[i]);
        }
        cb && cb(err, arr);
    });
};

let getWebHooksAll = function (lis, cb) {
    redis.HGETALL(HashWebHooks + lis, function (err, data) {
        let arr = [];
        if (err) {
            console.log(err);
        } else if (data) {
            // console.log(data);
            for (let k in data) {
                if (data.hasOwnProperty(k))
                    arr.push(data[k]);
            }
        }
        cb && cb(err, arr);
    });
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
    res.send('v1.0.0.0');
};

let _getByListenerSn = function (req, res, next) {
    let {sn, lis} = req.params;
    getWebHooks(sn, lis, function (err, data) {
        res.send(data);
    });
};

let _getAllListener = function (req, res, next) {
    let lis = req.params.lis;
    getWebHooksAll(lis, function (err, data) {
        res.send(data);
    });
};

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
    getWebHooks(sn, "GPSPosition", function (err, data) {
        doWebPush(data, pos);
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
    getWebHooks(sn, "GPSPower", function (err, data) {
        doWebPush(data, pow);
        res.send("1");
    });
};

let _event = function (req, res, next) {
    let eve = req.body;
    if (!eve) {
        res.send('0');
        return;
    }
    let sn = eve[0].SerialNumber;
    let url = GetLastPositionUrl + sn;
    request(url, function (err, response, body) {
        try {
            body = JSON.parse(body);
        } catch (e) {
            body = {};
        }
        getWebHooks(sn, "GPSEvent", function (err, data) {
            if (data.length > 0) {
                for (let i = 0; i < eve.length; i++) {
                    if (!eve[i].AlarmType && eve[i].EventType) {
                        eve[i].AlarmType = eve[i].EventType;
                        eve[i].EventTime = eve[i].UpTime;
                    }
                    if (body.GPSTime && Math.abs(body.GPSTime - eve[i].UpTime) < 60) {
                        eve[i].Lat = body.Lat;
                        eve[i].Lng = body.Lng;
                        eve[i].EventTime = eve[i].UpTime;
                        eve[i].Lat_Gg = body.Lat_Gg;
                        eve[i].Lat_Bd = body.Lat_Bd;
                        eve[i].Lng_Gg = body.Lng_Gg;
                        eve[i].Lng_Bd = body.Lng_Bd;
                    }
                    if (eve[i].AlarmType === 51) {
                        eve[i].Message = "指纹录入成功";
                    }
                }
                doWebPush(data, eve);
            }
            res.send("1");
        });
    });
};

let _network = function (req, res, next) {
    // console.log(req.body);
    res.status(200).send('1');
};

let _addListen = function (data, cb) {
    let key = data.TargetDevice;
    let lis = data.Listener;
    getWebHooks(key, lis, function (err, result) {
        if (!err) {
            if (!result || result.indexOf(data.TargetUrl) < 0) {
                redis.HSET(HashWebHooks + lis, key, data.TargetUrl);
            } else console.log("重复不添加");
        }
        cb && cb(err, "ok");
    });
};

let __doPostSave = function (url, obj, res) {
    if (url) {
        _addListen(data, function (err, msg) {
            err ? res.send(505, err.Message) : res.send(msg);
        });
    } else res.send('NO-URL');
};

let _doPost = function (req, res, next) {
    let data = _util.ClassClone(__Demo_Class, req.body, res);
    if (data === null) next();
    __doPostSave(url, data, res);
};

let _doPositionPost = function (req, res, next) {
    let sn = req.params.sn, url = req.query.url || req.body.url;
    __doPostSave(url, {TargetDevice: sn, TargetUrl: url, Listener: "GPSPosition"}, res);
};

let _doEventPost = function (req, res, next) {
    let sn = req.params.sn, url = req.query.url || req.body.url;
    __doPostSave(url, {TargetDevice: sn, TargetUrl: url, Listener: "GPSEvent"}, res);
};

let _doPowerPost = function (req, res, next) {
    let sn = req.params.sn, url = req.query.url || req.body.url;
    __doPostSave(url, {TargetDevice: sn, TargetUrl: url, Listener: "GPSPower"}, res);
};

let _doNetWorkPost = function (req, res, next) {
    let sn = req.params.sn, url = req.query.url || req.body.url;
    __doPostSave(url, {TargetDevice: sn, TargetUrl: url, Listener: "GPSNetWork"}, res);
};

/* GET users listing. */
router.get('/', _default);
router.get('/lis/:lis/:sn', _getByListenerSn);
router.get('/all/:lis', _getAllListener);

router.post('/', _doPost);
// 轨迹推送收集
router.get('/push/position/:sn', _doPositionPost);
router.post('/push/position/:sn', _doPositionPost);
// 事件推送收集
router.get('/push/event/:sn', _doEventPost);
router.post('/push/event/:sn', _doEventPost);
// 电量推送收集
router.get('/push/power/:sn', _doPowerPost);
router.post('/push/power/:sn', _doPowerPost);
// 网络推送收集
router.get('/push/network/:sn', _doNetWorkPost);
router.post('/push/power/:sn', _doNetWorkPost);

// 发送各类型推送
router.post('/location', _location);
router.post('/power', _power);
router.post('/event', _event);
router.post('/network', _network);

module.exports = router;