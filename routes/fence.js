/**
 * Created by hvail on 2017/9/25.
 */

var express = require('express');
var request = require('./../my_modules/request');
var gpsUtil = require('./../my_modules/gpsutils');
var myUtil = require('./../my_modules/utils');
var util = require('util');
var router = express.Router();
var area = process.env.DATAAREA || "zh-cn";

var fenceUrl = "http://v3.res-mongo.server." + area + ".sky1088.com/fence/sn/";
const FenceTypeEnum = [null, gpsUtil.IsPointInCircle, gpsUtil.IsPointInRect, gpsUtil.IsPointInPolygon];

const FenceTriggerTitle = "Device %s has %s fence %s";
const EnterTitle = "entered";
const LeaveTitle = "exited";

const ExchangeName = "hyz.protocol.BaseEvent";

var time = function () {
    return Math.round(new Date().getTime() / 1000);
}

var TriggerFenceAlarm = function (sn, fence, x) {
    var io_type = x ? EnterTitle : LeaveTitle;
    var title = util.format(FenceTriggerTitle, sn, io_type, fence.Name);
    var be = {};
    be.EventType = 0x0E + (x ? 1 : 0);
    be.Message = title;
    be.UpTime = time();
    be.SerialNumber = sn;
    be.Description = "By Web Hooks";
    console.log(be);
    // 利用MQ进行消息中转
    myUtil.SendMqObject(ExchangeName, [be], sn);
}

var toCoordPoi = function (fence, p) {
    if (!fence.Coord || fence.Coord == "WGS84") {
        return {Lat: p.Lat, Lng: p.Lng};
    } else if (fence.Coord == "GCJ02") {
        return {Lat: p.Lat_Gg || p.Lat, Lng: p.Lng_Gg || p.Lng};
    } else if (fence.Coord == "BD09") {
        return {Lat: p.Lat_Bd || p.Lat, Lng: p.Lng_Bd || p.Lng};
    } else {
        return {Lat: p.Lat, Lng: p.Lng};
    }
}

var trigger = function (ps, fence) {
    var fp = ps[0];
    var _fenceCalc = FenceTypeEnum[fence.Type];
    var poi = toCoordPoi(fence, fp);
    var _io_f = _fenceCalc(fence.Points, poi.Lat, poi.Lng);
    for (var i = 1; i < ps.length; i++) {
        poi = toCoordPoi(fence, ps[i]);
        var _tio = _fenceCalc(fence.Points, poi.Lat, poi.Lng);
        if (_tio != _io_f) {
            // 触发围栏报警
            TriggerFenceAlarm(fp.SerialNumber, fence, _tio);
        }
        _io_f = _tio;
    }
}

var _location = function (req, res, next) {
    // console.log('_location ' + JSON.stringify(req.body));
    var pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    var _pos = [];
    for (var i = 0; i < pos.length; i++) if (pos[i] && pos[i] != "null") _pos.push(pos[i]);
    pos = _pos;
    var sn = pos[0].SerialNumber;
    var getFenceUrl = fenceUrl + sn;
    request.Get(getFenceUrl, function (err, result) {
        // console.log(getFenceUrl + " : " + result);
        var fences = JSON.parse(result);
        if (fences.length < 1 || pos.length < 2) return;
        for (var i = 0; i < fences.length; i++) {
            trigger(pos, fences[i]);
        }
    });
    res.send("1");
}

router.get('/');
router.post('/location', _location);

module.exports = router;

