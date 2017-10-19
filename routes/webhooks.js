/***
 * Created by hvail on 2017/9/23.
 */
var express = require('express');
var router = express.Router();
var _util = require('./../my_modules/utils');
var util = require('util');
var redis = require('./../my_modules/redishelp');

const HashWebHooks = "web-hook-listener-hash";
const SetSendStatusTotalKey = "web-hook-send-total-";
const SetSendStatusSuccessKey = "web-hook-send-success-";
const SetSendStatusFailureKey = "web-hook-send-failure-";

var __Demo_Class = {
    TargetUrl: _util.REQUIRED,
    TargetDevice: "0000000000000000",
    Listener: "GPSPosition"
}

// key = Listener+TargetDevice
var getWebHooks = function (sn, lis, cb) {
    var key_a = lis + "_0000000000000000";
    var key_b = lis + "_" + sn.substring(0, 6) + "0000000000";
    var key_c = lis + "_" + sn;
    redis.HMGET(HashWebHooks, key_a, key_b, key_c, function (err, data) {
        var arr = [];
        for (var i = 2; i > -1; i--) {
            if (!!data[i]) arr.push(JSON.parse(data[i]));
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
    console.log(url + "(" + status + ")" + " - " + JSON.stringify(data));
}

var doWebPush = function (arr, data) {
    for (var i = 0; i < arr.length; i++)
        for (var j = 0; j < data.length; j++)
            _util.DoPushPost(arr[i].TargetUrl, data[j], totalPush);
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

var _doPost = function (req, res, next) {
    var data = _util.ClassClone(__Demo_Class, req.body, res);
    if (data == null) next();

    var key = data.Listener + "_" + data.TargetDevice;
    redis.HGET(HashWebHooks, key, function (err, result) {
        if (err) {
            res.send(505, err.Message);
            return;
        }
        var arr = result != null ? JSON.parse(result) : [];
        if (!result || result.indexOf(JSON.stringify(data)) < 0) {
            arr.push(data);
            redis.HSET(HashWebHooks, key, JSON.stringify(data));
        } else console.log("重复不添加");
        res.send("ok");
    });
}

var _location = function (req, res, next) {
    var pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    var _pos = [];
    for (var i = 0; i < pos.length; i++) {
        if (pos[i] && pos[i] != "null") {
            _pos.push(pos[i]);
        }
    }
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
    getWebHooks(sn, "GPSEvent", function (err, data) {
        for (var i = 0; i < data.length; i++) {
            if (!data[i].AlarmType && data[i].EventType)
                data[i].AlarmType = data[i].EventType;
        }
        doWebPush(data, eve);
        res.send("1");
    });
}

/* GET users listing. */
router.get('/', _default);
router.get('/lis/:lis/:sn', _getByListenerSn);

router.post('/', _doPost);
router.post('/location', _location);
router.post('/power', _power);
router.post('/event', _event);

module.exports = router;