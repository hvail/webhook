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
var first_data = 1504195200;    // 里程统计从 UTC: 2017-08-01 开始算起
var key_mileage_calc = "SET-spark-mileage-end-time"; // 记录最后计算的时间
var readUrl = "http://v3.res-ots.server." + area + ".sky1088.com/track/range-mileage/";
var post_url = "http://v3.res-mongo.server." + area + ".sky1088.com/mileage";

var temp = new myUtil.Hash();
var failUrlList = "LIST-range-mileage-None";

var tempArrays = [];

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
                try {
                    var __body = JSON.parse(body);
                    cb && cb(score, end, __body);
                } catch (e) {
                    console.log(e);
                    console.log(url);
                    console.log(body);
                    cb && cb(0, 0, []);
                    // _readMileageRange(sn, last, cb);
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
    var sn;
    var obj = new myUtil.Hash();
    for (var key in pack_hash._hash) {
        var ps = pack_hash._hash[key];
        if (ps.length < 2) continue;
        var pf = ps.first(), pe = ps.last();
        var sn = pf.SerialNumber;
        var _maxSpeed = ps.max('Speed');
        var _aveMileage = ps.ave('Mileage');
        if (!top_end_point) top_end_point = pf;
        var dis = Math.round((pe.Mileage - top_end_point.Mileage) * 1000);
        if (dis < 0 || dis > 20000 || pe.Mileage < 10 || pe.Mileage % 1 != 0) {
            // 如果量程小于0，距离大于20公里，总里程小于10，总里程不是整数，则取全部的距离
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
        }

        // if (pe.Mileage > 10 && (pe.Mileage % 1 == 0) && 0 > (pe.Mileage - top_end_point.Mileage) < 20) {
        // 最后点的里程大于10 , 是个整数 ,
        // dis = Math.round((pe.Mileage - top_end_point.Mileage) * 1000);
        // if (dis < 0) {
        //     console.log(sn + " : " + dis + " start : " + top_end_point.Mileage + " -t " + top_end_point.GPSTime + " : end " + pe.Mileage + " -t " + pe.GPSTime);
        //     console.log(sn + " -> Max Speed : " + _maxSpeed + " , Ave Mileage : " + _aveMileage);
        // }
        // top_end_point = pe;
        // }
        // else if (top_end_point && (key * 1 - top_end_point.GPSTime) < calc_mid) {
        //     var middle_time = pf.GPSTime - top_end_point.GPSTime;
        //     // 如果有上一个点并且和此次时间相差小于静止间隔，则按比例分配两点间的距离
        //     var mid_distance = gpsUtil.GetDistance(top_end_point.Lat, top_end_point.Lng, pf.Lat, pf.Lng) || 0;
        //     if (middle_time > 0 && middle_time < calc_mid && mid_distance > 10) {
        //         var ut = mid_distance / middle_time;
        //         var ft = _format_gt(pf.GPSTime, calc_mid);
        //         var left = Math.round((ft - top_end_point.GPSTime) * ut), right = Math.round((pf.GPSTime - ft) * ut);
        //         obj._hash[top_key] && (obj._hash[top_key].Distance += left);
        //         dis = right;
        //     }
        //     dis = Math.round(dis + gpsUtil.GetLineDistance(ps));
        // } else if (!top_end_point) {
        //     dis = gpsUtil.GetLineDistance(ps);
        // }
        // 暂时先放弃(设备提供的里程精度太低) 17-11-6
        // 优先使用设备里程。 17-11-7
        // if (pe.Mileage > pf.Mileage) dis = Math.round((pe.Mileage - pf.Mileage) * 1000);
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
        if ((os < _maxSpeed * 1.5) || (_maxSpeed == 0 && os < 240)) {
            if (_maxSpeed < os) __obj.MaxSpeed = (os * 1.2).toFixed(3) + " km/h";
            __obj.Speed = (__obj.Speed * 3.6).toFixed(3) + " km/h";
            obj.add(key, __obj);
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
    if (push_obj.length > 0)
        myUtil.DoPushPost(post_url, push_obj, function (url, data, status) {
            if (status != 1) {
                console.log(post_url + " " + sn + " ( " + push_obj.length + " ) : " + status + " -- ");
                console.log(push_obj);
            }
        });
}

var _calcUrlMileage = function (url, cb) {
    request(url, function (err, response, body) {
        var _body = JSON.parse(body);
        var obj = _calcMiddleMileage(_body);
        for (var k in obj._hash) {
            if (obj._hash[k].length < 2) obj.remove(k);
        }
        var calc_obj = _calc_pack_mileage(obj);
        cb && cb(calc_obj);
    });
}

var _calcMiddleMileage = function (data) {
    var df = data.first(), de = data.last();
    var _start = _format_gt(df.GPSTime, calc_mid), end = _format_gt(de.GPSTime, calc_mid) + calc_mid, i = 0;
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

/***
 * 开始计算里程到指定时间
 * @param sn
 * @param lt
 * @param cb
 * @constructor
 */
var startCalcMileage = function (sn, lt, cb) {
    // 格式化最后时间
    var _last_time = _format_gt(lt, calc_length);
    _readMileageRange(sn, _last_time, function (start, end, data) {
        if (start == 0) {
            cb && cb();
            return;
        }
        if (data && data.length > 0) {
            var obj = _middle_mileage(start, end, data);
            if (obj.count() > 0) {
                var calc_obj = _calc_pack_mileage(obj);
                if (calc_obj.count() < 1 && data.length > 10) {
                    var url = readUrl + sn + "/" + start + "/" + end;
                    // console.log(sn + " -> " + calc_obj.count() + "/" + obj.count() + "/" + data.length + " : " + new Date(start * 1000).FormatDate(4));
                    // console.log(readUrl + sn + "/" + start + "/" + end);
                    // 交给链路复查
                    redis.RPUSH(failUrlList, url);
                }
                _do_save_mileage(calc_obj, sn, calc_mid);
            }
        }
        var dd = end - calc_mid;
        redis.ZADD(key_mileage_calc, dd, sn);
        end < _last_time ? startCalcMileage(sn, lt, cb) : cb && cb();
    });
}

var __loop__run = false;
var __loop = function () {
    if (tempArrays.length > 0) {
        __loop__run = true;
        var sn = tempArrays.shift();
        // console.log('开始计算 ' + sn + ' 的里程统计 余 ' + tempArrays.length + ' 台设备未处理');
        startCalcMileage(sn, myUtil.GetSecond(), __loop);
    } else {
        __loop__run = false;
        // console.log('全部运行已经完成，等待新的任务');
    }
}

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
        var _data;
        var i = 0;
        while (!_data) {
            _data = data[i];
            i++;
        }
        if (!_data) {
            res.send("-4");
            return;
        }
        data = _data;
    }
    var sn = data.SerialNumber;
    res.send(_add_temp(sn));
}

var doSingle = function (req, res, next) {
    var sn = req.params.sn;
    res.send(_add_temp(sn));
}

var _add_temp = function (sn) {
    if (tempArrays.length > 50) {
        return "-2";
    } else if (tempArrays.indexOf(sn) == -1) {
        tempArrays.push(sn);
        if (!__loop__run) __loop();
        return "1";
    } else {
        return "-1";
    }
}

/* GET users listing. */
router.get('/', demo);
router.post('/', doLocationPost);
router.post('/single/:sn', doSingle);

module.exports = router;
