/**
 * Created by hvail on 2017/9/25.
 */

const express = require('express');
const request = require('request');
const gpsUtil = require('./../my_modules/gpsutils');
const myUtil = require('./../my_modules/utils');
const redis = require('./../my_modules/redishelp');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const fenceUrl = "http://v3.res-mongo.server." + area + ".sky1088.com/fence/sn/";
const FenceTypeEnum = [null, gpsUtil.IsPointInCircle, gpsUtil.IsPointInRect, gpsUtil.IsPointInPolygon];

const FenceTriggerTitle = "Device %s has %s fence %s";
const EnterTitle = "entered";
const LeaveTitle = "exited";

const key_poi_calc = "HASH-spark-end-point";
const ExchangeName = "hyz.protocol.BaseEvent";

const time = function () {
    return Math.round(new Date().getTime() / 1000);
};

let TriggerFenceAlarm = function (sn, fence, x) {
    let io_type = x ? EnterTitle : LeaveTitle;
    let title = util.format(FenceTriggerTitle, sn, io_type, fence.Name);
    let be = {};
    be.EventType = 0x0E + (x ? 1 : 0);
    be.Message = title;
    be.UpTime = time();
    be.SerialNumber = sn;
    be.Description = "By Web Hooks";
    // 利用MQ进行消息中转
    console.log(JSON.stringify(be));
    myUtil.SendMqObject(ExchangeName, [be], sn);
}

let toCoordPoi = function (fence, p) {
    if (!fence.Coord || fence.Coord === "WGS84") {
        return {Lat: p.Lat, Lng: p.Lng};
    } else if (fence.Coord === "GCJ02") {
        return {Lat: p.Lat_Gg || p.Lat, Lng: p.Lng_Gg || p.Lng};
    } else if (fence.Coord === "BD09") {
        return {Lat: p.Lat_Bd || p.Lat, Lng: p.Lng_Bd || p.Lng};
    } else {
        return {Lat: p.Lat, Lng: p.Lng};
    }
};

let trigger = function (ps, fence) {
    let fp = ps[0];
    let _fenceCalc = FenceTypeEnum[fence.Type];
    let poi = toCoordPoi(fence, fp);
    let _io_f = _fenceCalc(fence.Points, poi.Lat, poi.Lng);
    for (let i = 1; i < ps.length; i++) {
        poi = toCoordPoi(fence, ps[i]);
        let _tio = _fenceCalc(fence.Points, poi.Lat, poi.Lng);
        if (_tio !== _io_f) {
            // 触发围栏报警
            TriggerFenceAlarm(fp.SerialNumber, fence, _tio);
        }
        _io_f = _tio;
    }
};

let _readLastAndSet = function (sn, poi, cb) {
    redis.hget(key_poi_calc, sn, function (err, rs) {
        err && console.log(err);
        if (rs !== null && rs[0] === '{') {
            let obj = JSON.parse(rs);
            cb && cb([obj]);
        } else cb && cb(null);
        redis.hset(key_poi_calc, sn, JSON.stringify(poi));
    });
};

let _location = function (req, res, next) {
    let pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    let _pos = [];
    for (let i = 0; i < pos.length; i++) if (pos[i] && pos[i] !== "null") _pos.push(pos[i]);
    pos = _pos;
    let sn = pos[0].SerialNumber;
    let getFenceUrl = fenceUrl + sn;
    request(getFenceUrl, function (err, response, result) {
        if (response.statusCode !== 200 && result === "[]") return;
        try {
            let fences = JSON.parse(result);
            if (fences.length < 1 || pos.length < 1) return;
            // 这里读取最后一次记录的轨迹点
            _readLastAndSet(sn, pos[pos.length - 1], function (poi) {
                if (poi !== null) pos = pois.concat(pos);
                for (let i = 0; i < fences.length; i++) {
                    trigger(pos, fences[i]);
                }
            });
        } catch (e) {
            // console.log(e);
            // console.log("GET " + getFenceUrl + " : " + response.statusCode);
        }
    });
    res.send("1");
}

router.get('/');
router.post('/location', _location);

module.exports = router;

