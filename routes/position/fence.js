/***
 * Created by hvail on 2017/9/25.
 **/

const express = require('express');
const request = require('request');
const apiBase = require('api-base-hvail');
let {util: apiUtil, gpsutil} = apiBase;

const gpsUtil = require('../../my_modules/gpsutils');
const redis = require('../../my_modules/redishelp');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const fenceUrl = `http://v3.res.server.${area}.sky1088.com/fence/sn/`;
const mqPostUrl = `http://v3.mq-rabbit.server.${area}.sky1088.com/data`;
const FenceTypeEnum = [null, gpsUtil.IsPointInCircle, gpsUtil.IsPointInRect, gpsUtil.IsPointInPolygon];

const FenceTriggerTitle = "Device %s has %s fence %s";
const EnterTitle = "entered";
const LeaveTitle = "exited";

const key_poi_calc = "HASH-spark-end-point";
// const ExchangeName = "hyz.fanout.event";

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
    console.log(JSON.stringify(be));
    // 利用MQ进行消息中转
    apiUtil.PromisePost(mqPostUrl, [be])
        .then(msg => {
            console.log(`${mqPostUrl} ==> ${msg}`);
        })
};

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
        if (ps[i].UpMode > 1) continue;
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
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;
    let getFenceUrl = fenceUrl + sn;
    if (_pos.length > 0)
        apiUtil.PromiseGet(getFenceUrl)
            .then(JSON.parse)
            .then(fences => {
                fences.length > 0 && _readLastAndSet(sn, _pos.last(), (poi) => {
                    // console.log(fences);
                    if (poi !== null) _pos = poi.concat(_pos);
                    for (let i = 0; i < fences.length; i++) {
                        trigger(_pos, fences[i]);
                    }
                });
                // if (fences.length > 0) {
                //     console.log(`${getFenceUrl} length is ${fences.length}`);
                // }
            })
            .catch(e => console.log(e));
    next();
};

router.get('/');
router.post('/', _location);

module.exports = router;

