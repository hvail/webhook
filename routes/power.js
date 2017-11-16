/***
 * 电量及其周期性计算(15分钟存入一个点)
 * Created by hvail on 2017/10/16.
 */
var util = require('util');
var myUtil = require('./../my_modules/utils');
var redis = require('./../my_modules/redishelp');
var request = require('request');
var express = require('express');
var router = express.Router();
var area = process.env.DATAAREA || "zh-cn";
var calc_length = 4 * 3600;
var calc_mid = 900;
var first_data = 1501516801; // 电量统计从 UTC: 2017-08-01 开始算起

var key_power_calc = "SET-spark-end-time";
var host = util.format("http://v3.res-ots.server.%s.sky1088.com", area);
var batch_host = util.format("http://v3.res-ots.server.%s.sky1088.com/power-timer/batch", area);

/* GET users listing. */
// router.get('/', function (req, res, next) {
//     res.send('respond with a resource');
// });
// Demo http://v3.res-ots.server.zh-cn.sky1088.com/power/range/0503041708260062/0/1507349366

var getRangePower = host + "/power/range/%s/%s/%s";

var calcMidPowers = function (sn, start, end, cb) {
    if (!start) start = first_data;
    if (!end) end = Math.round(new Date().getTime() / 1000);
    var url = util.format(getRangePower, sn, start, end);
    request(url, function (err, res, body) {

        var data = JSON.parse(body);
        // console.log(url + ": length " + data.length);
        if (start == first_data) {
            start = data[0].PowerTime - data[0].PowerTime % calc_mid;
            // console.log(sn + " init power timer format start is " + start)
            calcMidPowers(sn, start, end, cb);
        } else {
            // var clen = end - start;
            var _st = start - start % calc_mid;
            var _et = end - end % calc_mid;
            for (var i = 0; i < data.length; i++) {
                data[i] = formatPower(data[i]);
            }
            // var sn = data[0].SerialNumber;
            var res_calc = powerArgSearch(data);
            if (res_calc == null) {
                calcMidPowers(sn, start, end + calc_length, cb);
                return;
            }

            i = 0;
            var result = [];
            while (i < data.length) {
                var ps = [];
                // _ptst : _pa 的前一个格式时间, _ptet : _pa 的后一个格式时间
                var _pa = data[i], _ptst = _pa.PowerTime - _pa.PowerTime % calc_mid, _ptet = _ptst + calc_mid;
                ps.push(_pa);
                while (i++ < data.length - 1) {
                    var _pb = data[i];
                    if (_pb.PowerTime < _ptet) ps.push(_pb);
                    else break;
                }
                // 此时间段内的平台电压
                var ave = powersAverage(ps);
                result.push({SerialNumber: _pa.SerialNumber, PowerValue: ave, PowerTime: _ptst});
            }
            var i = 0, limit = 200;
            var sendCount = 0;
            var mss = [];
            while (i < result.length) {
                var endPoi = i + limit < result.length ? i + limit : result.length;
                var _sub_ps = result.slice(i, endPoi);
                mss.push(_sub_ps);
                i = i + limit;
            }
            poolPost(mss, function () {
                cb && cb(err, result[result.length - 1].PowerTime);
            });
        }
    });
};

var poolPost = function (subs, cb, i) {
    var i = i || 0;
    if (i >= subs.length) {
        cb && cb();
        return;
    }
    myUtil.DoPushPost(batch_host, subs[i], function (url, data, status, body) {
        // console.log("POST : " + batch_host + " Length : " + body);
        i++;
        poolPost(subs, cb, i);
    });
}

// 具体算法
var powerRight = function (p1, p2, io) {
    var kn = io == 0 ? "BatInside" : "BatOutside";
    if (io == -1 && p1.BatOutside > 8000) kn = "BatOutside";
    var pv1 = p1[kn], pv2 = p2[kn];
    if (pv1 == pv2) return "HOLD";
    return pv1 < pv2 ? "UP" : "DOWN";
}

var powersAverage = function (ps) {
    if (ps == null || ps.length < 1) return null;
    var aveSum = 0;
    for (var i = 0; i < ps.length; i++) {
        aveSum += ps[i].PowerValue;
    }
    return Math.round(aveSum / ps.length);
}

// 找出最高值，最低值，初始值，结束值
var powerArgSearch = function (ps) {
    if (ps == null || ps.length < 2) return null;
    // if (ps.length == 1) {
    //     var p = ps[0];
    //     return {Max: p.PowerValue, MaxTime: p.PowerTime, Min: p.PowerValue, MinTime: p.PowerTime};
    // }
    // var fv = ps[0].PowerValue, ev = ps[ps.length - 1].PowerValue;
    var hv = 0, ht, lv = 99999999999, lt, average;
    var aveSum = 0;
    for (var i = 0; i < ps.length; i++) {
        var pi = ps[i];
        if (lv < pi.PowerValue) {
            lv = pi.PowerValue;
            lt = pi.PowerTime;
        }
        if (hv > pi.PowerValue) {
            hv = pi.PowerValue;
            ht = pi.PowerTime;
        }
        aveSum += pi.PowerValue;
    }
    average = Math.round(aveSum / ps.length);
    return {Max: hv, MaxTime: ht, Min: lv, MinTime: lt, Average: average};
};

// 暂时弃用
var powerMidTime = function (data, start, end) {
    var bd = data[0];
    var i = 0, sn = bd.SerialNumber;
    var result = [];
    while (start + calc_mid < end) {
        var midTime = start + calc_mid;
        var ps = [];
        for (; i < data.length; i++) {
            if (data[i].PowerTime < midTime) {
                ps.push(data[i]);
            } else {
                break;
            }
        }
        if (ps.length < 1) {
            var obj = {SerialNumber: sn, PowerValue: bd.PowerValue, PowerTime: midTime};
            result.push(obj);
        } else if (ps.length == 1) {
            var _pt = ps[0];
            bd = _pt;
            var obj = {SerialNumber: sn, PowerValue: _pt.PowerValue, PowerTime: midTime};
            result.push(obj);
        } else if (ps.length > 1) {

        }
    }
}

var formatPower = function (pw) {
    var kn = pw.BatPo == 0 ? "BatInside" : "BatOutside";
    return {
        SerialNumber: pw.SerialNumber,
        PowerValue: pw[kn],
        PowerTime: pw.PowerTime
    };
}

var getLastTime = function (req, res, next) {
    var sn = req.params.sn;
    redis.ZSCORE(key_power_calc, body.SerialNumber, function (err, score) {
        res.send(200, score);
    });
}

var doPostPower = function (req, res, next) {
    var body = req.body;
    var sn = body.SerialNumber;
    var end = body.PowerTime;
    redis.ZSCORE(key_power_calc, sn, function (err, score) {
        score = score || first_data;
        calcMidPowers(sn, score, end, function (err, lastTime) {
            // 最大的上传条数为200
            redis.ZADD(key_power_calc, lastTime, sn);
            res.status(200).send('' + lastTime);
        });
    });
}

var getDemo = function (req, res, next) {
    res.send('1.1.0.0 修改电压指示中的负数');
}

router.post('/', doPostPower);
router.get('/last/:sn', getLastTime);
router.get('/', getDemo);
module.exports = router;