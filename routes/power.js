/***
 * 电量及其周期性计算(15分钟存入一个点)
 * Created by hvail on 2017/10/16.
 */
let util = require('util');
let myUtil = require('./../my_modules/utils');
let redis = require('./../my_modules/redishelp');
let request = require('request');
let express = require('express');
let router = express.Router();
let area = process.env.DATAAREA || "zh-cn";
let calc_length = 4 * 3600;
let calc_mid = 900;
let first_data = 1501516801; // 电量统计从 UTC: 2017-08-01 开始算起

let key_power_calc = "SET-spark-end-time";
let host = util.format("http://v3.res-ots.server.%s.sky1088.com", area);
let batch_host = util.format("http://v3.res-ots.server.%s.sky1088.com/power-timer/batch", area);

let getRangePower = host + "/power/range/%s/%s/%s";

let calcMidPowers = function (sn, start, end, cb) {
    if (!start) start = first_data;
    if (!end) end = Math.round(new Date().getTime() / 1000);
    let url = util.format(getRangePower, sn, start, end);
    request(url, function (err, res, body) {
        if (res.statusCode === 200 && (body[0] === '[' || body[0] === '{')) {
            let data = JSON.parse(body);
            if (start === first_data && data.length > 0) {
                start = data[0].PowerTime - data[0].PowerTime % calc_mid;
                // console.log(sn + " init power timer format start is " + start)
                calcMidPowers(sn, start, end, cb);
            } else {
                // let clen = end - start;
                let _st = start - start % calc_mid;
                let _et = end - end % calc_mid;
                for (let i = 0; i < data.length; i++) {
                    data[i] = formatPower(data[i]);
                }
                let res_calc = powerArgSearch(data);
                if (res_calc === null) {
                    calcMidPowers(sn, start, end + calc_length, cb);
                    return;
                }

                let i = 0;
                let result = [];
                while (i < data.length) {
                    let ps = [];
                    // _ptst : _pa 的前一个格式时间, _ptet : _pa 的后一个格式时间
                    let _pa = data[i], _ptst = _pa.PowerTime - _pa.PowerTime % calc_mid, _ptet = _ptst + calc_mid;
                    ps.push(_pa);
                    while (i++ < data.length - 1) {
                        let _pb = data[i];
                        if (_pb.PowerTime < _ptet) ps.push(_pb);
                        else break;
                    }
                    // 此时间段内的平台电压
                    let ave = powersAverage(ps);
                    result.push({SerialNumber: _pa.SerialNumber, PowerValue: ave, PowerTime: _ptst});
                }
                i = 0, limit = 200;
                let sendCount = 0;
                let mss = [];
                while (i < result.length) {
                    let endPoi = i + limit < result.length ? i + limit : result.length;
                    let _sub_ps = result.slice(i, endPoi);
                    mss.push(_sub_ps);
                    i = i + limit;
                }
                poolPost(mss, function () {
                    cb && cb(err, result[result.length - 1].PowerTime);
                });
            }
        } else {
            console.log("calcMidPowers -> " + url + " : " + res.statusCode);
            cb && cb(res.statusCode);
        }
    });
};

let poolPost = function (subs, cb, i) {
    let _i = i || 0;
    if (_i >= subs.length) {
        cb && cb();
        return;
    }
    myUtil.PostUrl(batch_host, subs[_i], function (url, data, status, body) {
        _i++;
        poolPost(subs, cb, _i);
    }, "PowerSave");
};

// 具体算法
let powerRight = function (p1, p2, io) {
    let kn = io === 0 ? "BatInside" : "BatOutside";
    if (io === -1 && p1.BatOutside > 8000) kn = "BatOutside";
    let pv1 = p1[kn], pv2 = p2[kn];
    if (pv1 === pv2) return "HOLD";
    return pv1 < pv2 ? "UP" : "DOWN";
};

let powersAverage = function (ps) {
    if (ps === null || ps.length < 1) return null;
    let aveSum = 0;
    for (let i = 0; i < ps.length; i++) {
        aveSum += ps[i].PowerValue;
    }
    return Math.round(aveSum / ps.length);
};

// 找出最高值，最低值，初始值，结束值
let powerArgSearch = function (ps) {
    if (ps === null || ps.length < 2) return null;
    // if (ps.length == 1) {
    //     let p = ps[0];
    //     return {Max: p.PowerValue, MaxTime: p.PowerTime, Min: p.PowerValue, MinTime: p.PowerTime};
    // }
    // let fv = ps[0].PowerValue, ev = ps[ps.length - 1].PowerValue;
    let hv = 0, ht, lv = 99999999999, lt, average;
    let aveSum = 0;
    for (let i = 0; i < ps.length; i++) {
        let pi = ps[i];
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
let powerMidTime = function (data, start, end) {
    let bd = data[0];
    let i = 0, sn = bd.SerialNumber;
    let result = [];
    while (start + calc_mid < end) {
        let midTime = start + calc_mid;
        let ps = [];
        for (; i < data.length; i++) {
            if (data[i].PowerTime < midTime) {
                ps.push(data[i]);
            } else {
                break;
            }
        }
        if (ps.length < 1) {
            let obj = {SerialNumber: sn, PowerValue: bd.PowerValue, PowerTime: midTime};
            result.push(obj);
        } else if (ps.length === 1) {
            let _pt = ps[0];
            bd = _pt;
            let obj = {SerialNumber: sn, PowerValue: _pt.PowerValue, PowerTime: midTime};
            result.push(obj);
        } else if (ps.length > 1) {

        }
    }
};

let formatPower = function (pw) {
    let kn = pw.BatPo === 0 ? "BatInside" : "BatOutside";
    return {
        SerialNumber: pw.SerialNumber,
        PowerValue: pw[kn],
        PowerTime: pw.PowerTime
    };
};

let getLastTime = function (req, res, next) {
    let sn = req.params.sn;
    redis.ZSCORE(key_power_calc, body.SerialNumber, function (err, score) {
        res.send(200, score);
    });
};

let doPostPower = function (req, res, next) {
    let body = req.body;
    let sn = body.SerialNumber;

    if (sn.indexOf("619044") < 0) {
        res.status(200).send("1");
        return;
    }

    let end = body.PowerTime;
    redis.ZSCORE(key_power_calc, sn, function (err, score) {
        score = score || first_data;
        calcMidPowers(sn, score, end, function (err, lastTime) {
            if (err) {
                // res.status(200).send('' + err);
            } else {
                // 最大的上传条数为200
                redis.ZADD(key_power_calc, lastTime, sn);
                // res.status(200).send('' + lastTime);
            }
        });
    });
    res.status(200).send('1');
};

let getDemo = function (req, res, next) {
    res.send('1.1.0.0 修改电压指示中的负数');
};

router.post('/', doPostPower);
router.get('/last/:sn', getLastTime);
router.get('/', getDemo);
module.exports = router;