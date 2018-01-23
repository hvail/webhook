/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
let myUtil = require('./../my_modules/utils');
let gpsUtil = require('./../my_modules/gpsutils');
let redis = require('./../my_modules/redishelp');
let request = require('request');
let express = require('express');
let util = require('util');
let router = express.Router();
let area = process.env.DATAAREA || "zh-cn";
// let calc_length = 2 * 3600;      // 单次读取长度
let calc_mid = 5 * 60;              // 计算间隔5分钟
let calc_length = 12 * calc_mid;    // 单次读取长度,12个计算周期
let first_data = 1504195200;    // 里程统计从 UTC: 2017-08-01 开始算起
let key_mileage_calc = "SET-spark-mileage-end-time"; // 记录最后计算的时间
let readUrl = `http://v3.res.server.${area}.sky1088.com/mileage/range/`;
let post_url = `http://v3.res.server.${area}.sky1088.com/mileage`;

let temp = new myUtil.Hash();
let failUrlList = "LIST-range-mileage-None";
// 存储规则为右进左出
// RPUSH & LRANGE
let redisMileageList = "list-run-mileage-";

let tempArrays = [];

let demo = function (req, res, next) {
    res.send('mileage v1.2.0');
};

let _format_gt = function (time, mid) {
    return time - (time % mid);
};

let _getNextGPSTime = function (sn, start, cb) {
    let _now = _format_gt(Math.round(new Date().getTime() / 1000), calc_length);
    if (_now < start) {
        cb && cb(_now);
        return;
    }
    let url = readUrl + sn + "/" + start + "/" + _now + '?count=1';
    request(url, function (err, response, body) {
        if (err) {
            console.log("LINE:42 : " + url);
            console.log(err);
        }
        body = JSON.parse(body);
        if (body.length < 1) {
            cb && cb(_now);
            return;
        }
        cb && cb(body[0].GPSTime);
    });
};

/***
 * 获取数据库中保存的上一次计算起始点
 * @param sn
 * @param cb
 * @private
 */
let _getSaveMiddleTime = function (sn, cb) {
    redis.ZSCORE(key_mileage_calc, sn, function (err, score) {
        if (!score) {
            _getNextGPSTime(sn, first_data, function (n_score) {
                cb && cb(_format_gt(n_score, calc_length));
            });
        } else {
            cb && cb(score);
        }
    });
};

let _calc_pack_mileage = function (pack_hash) {
    let top_end_point = null;
    let top_key;
    let sn;
    let obj = new myUtil.Hash();
    for (let key in pack_hash._hash) {
        if (!pack_hash._hash.hasOwnProperty(key)) continue;
        let ps = pack_hash._hash[key];
        if (ps.length < 2) continue;
        let pf = ps.first(), pe = ps.last();
        let sn = pf.SerialNumber;
        let _maxSpeed = ps.max('Speed');
        let _aveMileage = ps.ave('Mileage');
        if (!top_end_point) top_end_point = pf;
        let dis = Math.round((pe.Mileage - top_end_point.Mileage) * 1000);
        if (dis < 0 || dis > 20000 || pe.Mileage < 10 || pe.Mileage % 1 !== 0) {
            // 如果量程小于0，距离大于20公里，总里程小于10，总里程不是整数，则取全部的距离
            let middle_time = pf.GPSTime - top_end_point.GPSTime;
            // 如果有上一个点并且和此次时间相差小于静止间隔，则按比例分配两点间的距离
            let mid_distance = gpsUtil.GetDistance(top_end_point.Lat, top_end_point.Lng, pf.Lat, pf.Lng) || 0;
            if (middle_time > 0 && middle_time < calc_mid && mid_distance > 10) {
                let ut = mid_distance / middle_time;
                let ft = _format_gt(pf.GPSTime, calc_mid);
                let left = Math.round((ft - top_end_point.GPSTime) * ut), right = Math.round((pf.GPSTime - ft) * ut);
                obj._hash[top_key] && (obj._hash[top_key].Distance += left);
                dis = right;
            }
            dis = Math.round(dis + gpsUtil.GetLineDistance(ps));
        }
        // 暂时先放弃(设备提供的里程精度太低) 17-11-6
        // 优先使用设备里程。 17-11-7
        let __obj = {
            Distance: dis,
            PointCount: ps.length,
            GPSTime: key * 1,
            MileageBegin: pf.Mileage,
            MileageEnd: pe.Mileage,
            MaxSpeed: _maxSpeed.toFixed(3) + " km/h",
            Speed: (dis / (pe.GPSTime - pf.GPSTime)).toFixed(3)
        };
        myUtil.logger(JSON.stringify(__obj));
        let os = __obj.Speed * 3.6;
        if ((os < _maxSpeed * 1.5) || (_maxSpeed === 0 && os < 240)) {
            if (_maxSpeed < os) __obj.MaxSpeed = (os * 1.2).toFixed(3) + " km/h";
            __obj.Speed = (__obj.Speed * 3.6).toFixed(3) + " km/h";
            obj.add(key, __obj);
        }
        top_key = key;
        top_end_point = pe;
    }
    return obj;
};

let _do_save_mileage = function (data, sn, middleTime) {
    let push_obj = [];
    for (let k in data._hash) {
        if (!data._hash.hasOwnProperty(k)) continue;
        let obj = data._hash[k];
        obj.SerialNumber = sn;
        obj.MiddleTime = middleTime;
        obj.TimeString = new Date(k * 1000).FormatDate(4);
        if (obj.Distance > 0) push_obj.push(obj);
    }
    if (push_obj.length > 0)
        myUtil.DoPushPost(post_url, push_obj, function (url, data, status) {
            if (status !== 1) {
                console.log(push_obj);
                myUtil.logger(`${post_url}, ${sn}, ${push_obj.length}, ${status} `)
            }
        });
};

let _calcUrlMileage = function (url, cb) {
    request(url, function (err, response, body) {
        if (response.statusCode === 200) {
            let _body = JSON.parse(body);
            let obj = _calcMiddleMileage(_body);
            if (obj === null) {
                cb && cb();
                return;
            }
            for (let k in obj._hash) {
                if (!obj._hash.hasOwnProperty(k)) continue;
                if (obj._hash[k].length < 2) obj.remove(k);
            }
            let calc_obj = _calc_pack_mileage(obj);
            myUtil.logger(`_calcUrlMileage ${url} - length :  ${_body.length} - valid : ${calc_obj.count()} - invalid : ${obj.count()}`);
            // redis.RPUSH(failUrlList, log);
            cb && cb(calc_obj);
        } else {
            cb && cb(0);
        }
    });
};

/***
 * 计算区间里程
 * @param data
 * @returns {*}
 * @private
 */
let _calcMiddleMileage = function (data) {
    if (data.length < 1) {
        return null;
    }
    let df = data.first(), de = data.last();
    let _start = _format_gt(df.GPSTime, calc_mid);
    let end = _format_gt(de.GPSTime, calc_mid) + calc_mid, i = 0;
    let obj = new myUtil.Hash();
    while (_start < end) {
        let dt = data[i].GPSTime, _m = _start * 1 + calc_mid;
        let key = _format_gt(dt, calc_mid);
        let das = [];
        if (dt < _m) {
            while (data[i].GPSTime < _m) {
                das.push(data[i]);
                i++;
                if (i === data.length) break;
            }
        }
        _start = _m;
        obj.add(key, das);
        if (i === data.length) break;
    }
    return obj;
};

/***
 * 开始计算里程到指定时间
 * @param sn
 * @param lt
 * @param cb
 * @param __start
 * @constructor
 */
let startCalcMileage = function (sn, lt, cb, __start) {
    // 格式化最后时间(最后的一次计算间隔时间点，如当前是2小时的计算间隔，现在是12:33 ，即最后计算的间隔为 09:55 - 12:00)
    let _last_time = _format_gt(lt, calc_length);
    let _start = __start * 1;
    if (_start && _start > (_last_time - calc_length - calc_mid)) {
        // 如果开始时间大于或等于最后时间的前一个计算间隔，则计算中止
        cb && cb();
        return;
    }

    if (!_start || _start < 1) {
        _getSaveMiddleTime(sn, function (top_start) {
            startCalcMileage(sn, lt, cb, top_start);
        });
        return;
    }

    // 组装此次请求的url
    let end = _format_gt(_start + calc_length + calc_mid, calc_length);
    let url = readUrl + sn + "/" + _start + "/" + end;
    _calcUrlMileage(url, function (result) {
        // 此处的result 是这个区间的数据集
        let dd = end - calc_mid;
        if (result) {
            redis.ZADD(key_mileage_calc, dd, sn);
            _do_save_mileage(result, sn, calc_mid);
        }
        startCalcMileage(sn, lt, cb, dd);
    });
};

let _readLeftList = function (key, cb) {
    redis.LRANGE(key, 0, 0, function (err, json) {
        // 从左边读取一条，以判断其时间与当前时间是否相差超过calc_length(两小时)
        let now = new Date().getTime() / 1000;
        console.log(json);
        console.log(util.isObject(json));
        let obj = util.isObject(json) ? json : JSON.parse(json);
        let mt = now - obj.GPSTime;
        console.log(util.isArray(obj));
        if (mt > calc_length) {
            // 开始读取整个区域的里程值，并传送到计算函数中。
            redis.LRANGE(key, 0, -1, function (err, jsonArr) {
                console.log(jsonArr);
            });
        }
        console.log(obj);
    });
    cb && cb();
};

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
let doLocationPost = function (req, res, next) {
    let data = req.body;
    let arr = [data];
    let sn = data.SerialNumber;
    if (util.isArray(data) && data.length > 0) {
        sn = data[0].SerialNumber;
        arr = data;
    }
    if (!!sn) {
        let key = redisMileageList.concat(sn);
        for (let i = 0; i < arr.length; i++) {
            // 右进
            redis.RPUSH(key, JSON.stringify(arr[i]));
        }
        // 左出
        _readLeftList(key, function () {

        });
    }
    res.status(200).send("1");
};

let doSingle = function (req, res, next) {
    res.statusCode(200).send("1");
    // let sn = req.params.sn;
    // res.send(_add_temp(sn));
};

let _add_temp = function (sn) {
    // if (tempArrays.length > 50) {
    //     return "-2";
    // } else if (tempArrays.indexOf(sn) === -1) {
    //     tempArrays.push(sn);
    //     if (!__loop__run) __loop();
    //     return "1";
    // } else {
    //     return "-1";
    // }
};

/* GET users listing. */
router.get('/', demo);
router.post('/', doLocationPost);
router.post('/single/:sn', doSingle);

module.exports = router;
