/***
 * Created by hvail on 2017/9/23.
 */
var express = require('express');
var request = require('request');
var router = express.Router();
var _util = require('./../my_modules/utils');
var util = require('util');
var area = process.env.DATAAREA || "zh-cn";
var redis = require('./../my_modules/redishelp');
const HashWebHooks = "web-hook-listener-hash-";
const SetSendStatusTotalKey = "web-hook-send-total-";
const SetSendStatusSuccessKey = "web-hook-send-success-";
const SetSendStatusFailureKey = "web-hook-send-failure-";

const GetLastPositionUrl = "http://v3.res.server." + area + ".sky1088.com/track/single/";

var __Demo_Class = {
    TargetUrl: _util.REQUIRED,
    TargetDevice: "0000000000000000",
    Listener: "GPSPosition"
};

// key = Listener+TargetDevice
var getWebHooks = function (sn, lis, cb) {
    var key_a = "0000000000000000";
    var key_b = sn.substring(0, 6) + "0000000000";
    var key_c = sn;
    redis.HMGET(HashWebHooks + lis, key_a, key_b, key_c, function (err, data) {
        var arr = [];
        for (var i = 2; i > -1; i--) {
            if (!!data[i] || data[i] == 'null') arr.push(JSON.parse(data[i]));
        }
        // console.log(arr.length);
        cb && cb(err, arr);
    });
}

var getWebHooksAll = function (lis, cb) {
    redis.HGETALL(HashWebHooks + lis, function (err, data) {
        var arr = [];
        if (err) {
            console.log(err);
        } else if (data) {
            // console.log(data);
            for (var k in data) {
                arr.push(data[k]);
            }
        }
        cb && cb(err, arr);
    });
}

var totalPush = function (url, data, status) {
    var ds = new Date().toISOString().split("T")[0];
    var totalKey = SetSendStatusTotalKey + ds;
    var statusKey = (status > 0 ? SetSendStatusSuccessKey : SetSendStatusFailureKey) + ds;
    redis.ZINCRBY(totalKey, 1, url);
    redis.ZINCRBY(statusKey, 1, url);
};

var doWebPush = function (arr, data) {
    for (var i = 0; i < arr.length; i++)
        for (var j = 0; j < data.length; j++)
            _util.DoPushPost(arr[i], data[j], totalPush);
}

// webHooks 信息存放于redis . 回执采用0 | 1
var _default = function (req, res, next) {
    res.send('v1.0.0.0');
}

var _getByListenerSn = function (req, res, next) {
    getWebHooks(req.params.sn, req.params.lis, function (err, data) {
        res.send(data);
    });
}

var _getAllListener = function (req, res, next) {
    var lis = req.params.lis;
    getWebHooksAll(lis, function (err, data) {
        res.send(data);
    });
}

var _location = function (req, res, next) {
    var pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    var _pos = [];
    for (var i = 1; i < pos.length; i++) {
        if (pos[i] && pos[i] != "null") {
            _pos.push(pos[i]);
        }
    }
    if (_pos.length < 1)return;
    pos = _pos;
    var sn = pos[0].SerialNumber;
    getWebHooks(sn, "GPSPosition", function (err, data) {
        doWebPush(data, pos);
        res.send("1");
    });
}

var _power = function (req, res, next) {
    var pow = req.body;
    if (!pow) {
        res.send('0');
        return;
    }
    if (!util.isArray(pow)) {
        var _pow = [];
        _pow.push(pow);
        pow = _pow;
    }
    var sn = pow[0].SerialNumber;
    getWebHooks(sn, "GPSPower", function (err, data) {
        doWebPush(data, pow);
        res.send("1");
    });
}

var _event = function (req, res, next) {
    var eve = req.body;
    if (!eve) {
        res.send('0');
        return;
    }
    var sn = eve[0].SerialNumber;
    var url = GetLastPositionUrl + sn;
    request(url, function (err, response, body) {
        try {
            body = JSON.parse(body);
        } catch (e) {
            body = {};
        }
        getWebHooks(sn, "GPSEvent", function (err, data) {
            if (data.length > 0) {
                console.log(sn + " GPSEvent : " + data + " LEN : " + data.length);
                for (var i = 0; i < eve.length; i++) {
                    if (!eve[i].AlarmType && eve[i].EventType)
                        eve[i].AlarmType = eve[i].EventType;
                    if (body.GPSTime && Math.abs(body.GPSTime - eve[i].UpTime) < 60) {
                        eve[i].Lat = body.Lat;
                        eve[i].Lng = body.Lng;
                        eve[i].Lat_Gg = body.Lat_Gg;
                        eve[i].Lat_Bd = body.Lat_Bd;
                        eve[i].Lng_Gg = body.Lng_Gg;
                        eve[i].Lng_Bd = body.Lng_Bd;
                    }
                }
                doWebPush(data, eve);
            }
            res.send("1");
        });
    });
}

var _addListen = function (data, cb) {
    var key = data.TargetDevice;
    var lis = data.Listener;
    getWebHooks(key, lis, function (err, result) {
        if (err) {
            cb && cb(err);
            return;
        }
        console.log(data.TargetUrl);
        if (!result || result.indexOf(data.TargetUrl) < 0) {
            redis.HSET(HashWebHooks + lis, key, data.TargetUrl);
        } else console.log("重复不添加");
        cb && cb(null, "ok");
    });
}

var _doPost = function (req, res, next) {
    var data = _util.ClassClone(__Demo_Class, req.body, res);
    if (data == null) next();
    if (url) {
        _addListen(data, function (err, msg) {
            if (err) {
                res.send(505, err.Message);
            } else {
                res.send(msg);
            }
        })
    } else {
        res.send('NO');
    }
}

var _doPositionPost = function (req, res, next) {
    var sn = req.params.sn, url = req.query.url;
    var data = {TargetDevice: sn, TargetUrl: url, Listener: "GPSPosition"};
    if (url) {
        _addListen(data, function (err, msg) {
            if (err) {
                res.send(505, err.Message);
            } else {
                res.send(msg);
            }
        });
    } else {
        res.send('NO');
    }
}

var _doEventPost = function (req, res, next) {
    var sn = req.params.sn, url = req.query.url;
    var data = {TargetDevice: sn, TargetUrl: url, Listener: "GPSEvent"};
    if (url) {
        _addListen(data, function (err, msg) {
            if (err) {
                res.send(505, err.Message);
            } else {
                res.send(msg);
            }
        });
    } else {
        res.send('NO');
    }
}

var _doPowerPost = function (req, res, next) {
    var sn = req.params.sn, url = req.query.url;
    if (url) {
        var data = {TargetDevice: sn, TargetUrl: url, Listener: "GPSPower"};
        _addListen(data, function (err, msg) {
            if (err) {
                res.send(505, err.Message);
            } else {
                res.send(msg);
            }
        });
    } else {
        res.send('no');
    }
}

/* GET users listing. */
router.get('/', _default);
router.get('/lis/:lis/:sn', _getByListenerSn);
router.get('/all/:lis', _getAllListener);
router.get('/push/position/:sn', _doPositionPost);
router.get('/push/event/:sn', _doEventPost);
router.get('/push/power/:sn', _doPowerPost);

router.post('/', _doPost);
router.post('/push/position/:sn', _doPositionPost);
router.post('/push/event/:sn', _doEventPost);
router.post('/push/power/:sn', _doPowerPost);
router.post('/location', _location);
router.post('/power', _power);
router.post('/event', _event);

module.exports = router;