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
var calc_length = 6 * 3600;     // 单次读取长度
var calc_mid = 5 * 60;          // 计算间隔5分钟
var first_data = 1400000000;    // 里程统计从 UTC: 2017-08-01 开始算起
var key_mileage_calc = "SET-spark-mileage-end-time"; // 记录最后计算的时间
var readUrl = "http://v3.res-ots.server." + area + ".sky1088.com/track/range-mileage/";
var post_url = "http://v3.res-mongo.server." + area + ".sky1088.com/mileage";

var demo = function (req, res, next) {
    res.send('mileage v1.0.0.0');
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
        console.log(url + " : " + body[0].GPSTime);
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
                console.log(sn + " read end ");
                cb && cb(0, 0, []);
                return;
            }
            end = score * 1 + calc_length;
            var url = readUrl + sn + "/" + score + "/" + end;
            request(url, function (err, response, body) {
                body = JSON.parse(body);
                // console.log(url + " : " + body.length);
                if (body.length == 0) {
                    _getNextGPSTime(sn, end, function (_socre) {
                        var __end = _format_gt(_socre, calc_length);
                        cb && cb(__end, __end + calc_length, body);
                    });
                } else {
                    cb && cb(score, end, body);
                }
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
    var obj = {};
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
        obj[key] = das;
        if (i == data.length) break;
    }
    return obj;
}

var _calc_pack_mileage = function (pack_hash) {
    var top_end_point = null;
    var top_key;
    var obj = {};
    for (var key in pack_hash) {
        var ps = pack_hash[key];
        if (ps.length < 2) continue;
        var dis = 0;
        var pf = ps.first(), pe = ps.last();
        if (top_end_point && key * 1 - top_end_point.GPSTime < calc_mid) {
            var middle_time = pf.GPSTime - top_end_point.GPSTime;
            // 如果有上一个点并且和此次时间相差小于静止间隔，则按比例分配两点间的距离
            var mid_distance = gpsUtil.GetDistance(top_end_point.Lat, top_end_point.Lng, pf.Lat, pf.Lng) || 0;
            if (middle_time < calc_mid && mid_distance > 10) {
                var ut = mid_distance / middle_time;
                var ft = _format_gt(pf.GPSTime, calc_mid);
                var left = Math.round((ft - top_end_point.GPSTime) * ut), right = Math.round((pf.GPSTime - ft) * ut);
                obj[top_key] && (obj[top_key].Distance += left);
                dis = right;
            }
        }
        dis = Math.round(dis + gpsUtil.GetLineDistance(ps));
        if (pe.Mileage > pf.Mileage) dis = Math.round((pe.Mileage - pf.Mileage) * 1000);
        if (dis > 0)
            obj[key] = {
                Distance: dis,
                PointCount: ps.length,
                GPSTime: key * 1
            };
        top_key = key;
        top_end_point = ps.last();
    }
    return obj;
}

var _do_save_mileage = function (data, sn, middleTime) {
    var push_obj = [];
    for (var k in data) {
        var obj = data[k];
        obj.SerialNumber = sn;
        obj.MiddleTime = middleTime;
        push_obj.push(obj);
    }
    if (push_obj.length > 1)
        myUtil.DoPushPost(post_url, push_obj, function (url, data, status) {
            console.log(post_url + " " + sn + " ( " + push_obj.length + " ) : " + status);
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
        if (start == 0) {
            cb && cb();
            return;
        }
        if (data && data.length > 0) {
            var obj = _middle_mileage(start, end, data);
            obj = _calc_pack_mileage(obj);
            _do_save_mileage(obj, sn, calc_mid);
        }
        var dd = end - calc_mid;
        redis.ZADD(key_mileage_calc, dd, sn);
        end < _last_time ? startCalcMileage(sn, lt, cb) : cb && cb();
    });
}

// var arr = [
//     "0500011708170038",
//     "0080001309220012",
//     "0024081501240113",
//     "6191081509190071",
//     "6191141702280026",
//     "6191141703040099",
//     "6191141703040174",
//     "0090081604020253",
//     "6191141703010017",
//     "3124301309110061",
//     "3124301312120039",
//     "6190081509210211",
//     "0090081603110025",
//     "6190081509050022",
//     "6124281503250066"
// ]
//
// var buildMileage = function (sn, cb) {
//     startCalcMileage(sn, myUtil.GetSecond(), cb);
// }
//
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
    startCalcMileage(sn, myUtil.GetSecond(), function () {
    });
    res.send("1");
}

/* GET users listing. */
router.get('/', demo);
router.post('/', doLocationPost);

module.exports = router;
