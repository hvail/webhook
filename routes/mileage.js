/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
var myUtil = require('./../my_modules/utils');
var gpsUtil = require('./../my_modules/gpsutils');
var redis = require('./../my_modules/redishelp');
var request = require('request');
var express = require('express');
var util = require('util');
var router = express.Router();
var area = process.env.DATAAREA || "zh-cn";
var calc_length = 2 * 3600;     // 单次读取长度
var calc_mid = 5 * 60;          // 计算间隔5分钟
var first_data = 1400000000;    // 里程统计从 UTC: 2017-08-01 开始算起
var key_mileage_calc = "SET-spark-mileage-end-time"; // 记录最后计算的时间
var readUrl = "http://v3.res-ots.server." + area + ".sky1088.com/track/range-mileage/";
var post_url = "http://v3.res-mongo.server." + area + ".sky1088.com/mileage";

var temp = new myUtil.Hash();

var demo = function (req, res, next) {
    res.send('mileage v1.1.0');
}

var _format_gt = function (time, mid) {
    return time - (time % mid);
}

var _getNextGPSTime = function (sn, start, cb) {
    var _now = _format_gt(Math.round(new Date().getTime() / 1000), calc_length);
    if (_now < start) {
        cb && cb(_now);
        return;
    }
    var url = readUrl + sn + "/" + start + "/" + _now + '?count=1';
    request(url, function (err, response, body) {
        body = JSON.parse(body);
        if (body.length < 1) {
            cb && cb(_now);
            return;
        }
        cb && cb(body[0].GPSTime);
    });
}

var _readMileageRange = function (sn, last, cb) {
    redis.ZSCORE(key_mileage_calc, sn, function (err, score) {
        if (!score) {
            _getNextGPSTime(sn, first_data, function (score) {
                var start = _format_gt(score, calc_length), end = start * 1 + calc_length;
                url = readUrl + sn + "/" + start + "/" + end;
                request(url, function (err, response, body) {
                    cb && cb(start, end, JSON.parse(body));
                });
            });
        } else {
            if (score >= last) {
                cb && cb(0, 0, []);
                return;
            }
            end = score * 1 + calc_length + calc_mid;
            var url = readUrl + sn + "/" + score + "/" + end;
            request(url, function (err, response, body) {
                body = JSON.parse(body);
                cb && cb(score, end, body);
            });
        }
    });
}

/***
 * 对里程进行时间分段
 * @param start
 * @param end
 * @param data
 * @returns {{}}
 * @private
 */
var _middle_mileage = function (start, end, data) {
    var _start = start, i = 0;
    var obj = new myUtil.Hash();
    while (_start < end) {
        var dt = data[i].GPSTime, _m = _start * 1 + calc_mid;
        var key = _format_gt(dt, calc_mid);
        var das = [];
        if (dt < _m) {
            while (data[i].GPSTime < _m) {
                das.push(data[i]);
                i++;
                if (i == data.length) break;
            }
        }
        _start = _m;
        obj.add(key, das);
        if (i == data.length) break;
    }
    return obj;
}

var _calc_pack_mileage = function (pack_hash) {
    var top_end_point = null;
    var top_key;
    var obj = new myUtil.Hash();
    for (var key in pack_hash._hash) {
        var ps = pack_hash._hash[key];
        if (ps.length < 2) continue;
        var dis = 0;
        var pf = ps.first(), pe = ps.last();
        var _maxSpeed = pf.Speed;
        for (var i = 1; i < ps.length; i++) {
            if (ps[i].Speed > _maxSpeed) _maxSpeed = ps[i].Speed;
        }
        if (pe.Mileage > 0 && pe.Mileage % 1 == 0) {
            dis = top_end_point ? Math.round((pe.Mileage - top_end_point.Mileage) * 1000) : Math.round((pe.Mileage - pf.Mileage) * 1000);
            top_end_point = pe;
        }
        else if (top_end_point && key * 1 - top_end_point.GPSTime < calc_mid) {
            var middle_time = pf.GPSTime - top_end_point.GPSTime;
            // 如果有上一个点并且和此次时间相差小于静止间隔，则按比例分配两点间的距离
            var mid_distance = gpsUtil.GetDistance(top_end_point.Lat, top_end_point.Lng, pf.Lat, pf.Lng) || 0;
            if (middle_time > 0 && middle_time < calc_mid && mid_distance > 10) {
                var ut = mid_distance / middle_time;
                var ft = _format_gt(pf.GPSTime, calc_mid);
                var left = Math.round((ft - top_end_point.GPSTime) * ut), right = Math.round((pf.GPSTime - ft) * ut);
                obj._hash[top_key] && (obj._hash[top_key].Distance += left);
                dis = right;
            }
            dis = Math.round(dis + gpsUtil.GetLineDistance(ps));
        } else if (!top_end_point) {
            dis = gpsUtil.GetLineDistance(ps);
        }
        // 暂时先放弃(设备提供的里程精度太低) 17-11-6
        // 优先使用设备里程。 17-11-7
        // if (pe.Mileage > pf.Mileage) dis = Math.round((pe.Mileage - pf.Mileage) * 1000);
        if (dis > 0) {
            var __obj = {
                Distance: dis,
                PointCount: ps.length,
                GPSTime: key * 1,
                MileageBegin: pf.Mileage,
                MileageEnd: pe.Mileage,
                MaxSpeed: _maxSpeed.toFixed(3) + " km/h",
                Speed: (dis / (pe.GPSTime - pf.GPSTime)).toFixed(3),
            };
            var os = __obj.Speed * 3.6;
            if (os < _maxSpeed * 1.5) {
                __obj.Speed = (__obj.Speed * 3.6).toFixed(3) + " km/h";
                obj.add(key, __obj);
            }
        } else {
            if (dis) console.log(dis)
        }
        top_key = key;
        top_end_point = pe;
    }
    return obj;
}

var _do_save_mileage = function (data, sn, middleTime) {
    var push_obj = [];
    for (var k in data._hash) {
        var obj = data._hash[k];
        obj.SerialNumber = sn;
        obj.MiddleTime = middleTime;
        obj.TimeString = new Date(k * 1000).FormatDate(4);
        push_obj.push(obj);
    }
    // console.log(data.count() + " / " + push_obj.length);
    if (push_obj.length > 0)
        myUtil.DoPushPost(post_url, push_obj, function (url, data, status) {
            console.log(post_url + " " + sn + " ( " + push_obj.length + " ) : " + status + " -- ");
        });
}

/***
 * 开始计算里程到指定时间
 * @param sn
 * @param lt
 * @param cb
 * @constructor
 */
var startCalcMileage = function (sn, lt, cb) {
    var _last_time = _format_gt(lt, calc_mid);
    _readMileageRange(sn, _last_time, function (start, end, data) {
        // if (data.length)
        //     console.log(sn + " -> " + start + " :-: " + end + " result length : " + data.length);
        if (start == 0) {
            cb && cb();
            return;
        }
        if (data && data.length > 0) {
            var obj = _middle_mileage(start, end, data);
            var calc_obj = _calc_pack_mileage(obj);
            console.log(calc_obj.count() + "/" + obj.count() + " : " + new Date(start * 1000).FormatDate(4));
            // if (obj.count() < 1 && data.length > 20) {
            //     console.log(sn + " -> " + start + " :-: " + end + " result length : " + data.length);
            //     console.log(readUrl + sn + "/" + start + "/" + end);
            // }
            _do_save_mileage(calc_obj, sn, calc_mid);
        }
        var dd = end - calc_mid;
        redis.ZADD(key_mileage_calc, dd, sn);
        end < _last_time ? startCalcMileage(sn, lt, cb) : cb && cb();
    });
}

// var arr = ["0026231709300026"]
// var buildMileage = function (sn, cb) {
//     startCalcMileage(sn, myUtil.GetSecond(), cb);
// }
// var pool = function (m) {
//     if (m >= arr.length) {
//         console.log('done');
//         return;
//     }
//     buildMileage(arr[m], function () {
//         m++;
//         pool(m);
//     })
// }
// pool(0);

/***
 * localmileage demo
 * SerialNumber
 * GPSTime
 * Lat
 * Lng
 * Mileage
 * @param req
 * @param res
 * @param next
 */
var doLocationPost = function (req, res, next) {
    var data = req.body;
    if (util.isArray(req.body)) {
        if (data.length > 0) data = data[0];
        else {
            res.send("-4");
            return;
        }
    }
    var sn = data.SerialNumber;
    if (!temp.items(sn)) {
        temp.add(sn, "Adds");
        startCalcMileage(sn, myUtil.GetSecond(), function () {
            temp.remove(sn);
            console.log(sn + " done")
        });
    } else {
        console.log(sn + " adds");
    }
    res.send("1");
}

/* GET users listing. */
router.get('/', demo);
router.post('/', doLocationPost);

module.exports = router;
