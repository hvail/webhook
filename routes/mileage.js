/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const request = require('request');
const express = require('express');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const calc_mid = 5 * 60;              // 计算间隔5分钟
const calc_length = 2 * calc_mid;    // 单次读取长度,2个计算周期 10分钟计算一次以减少系统压力和提高响应速度
const post_url = `http://v3.res.server.${area}.sky1088.com/mileage`;
// 存储规则为右进左出
// RPUSH & LRANGE
let redisMileageList = "list-run-mileage-";
let redisMileageDay = "day-mileage-";

let demo = function (req, res, next) {
    res.send('mileage v2.0.0');
};

let _format_gt = function (time, mid) {
    return time - (time % mid);
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
    if (push_obj.length > 0) {
        myUtil.PostUrl(post_url, push_obj, function (url, data, status) {
            if (status !== 1) {
                myUtil.logger(`${post_url}, ${sn}, ${push_obj.length}, ${status} `)
            }
        }, "MileageSave");
    }
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

let _checkLastValid = (key, len, cb) => {
    if (len < 1) {
        redis.DEL(key);
        cb && cb();
    } else {
        redis.LINDEX(key, 0, (err, json) => {
            let poi = JSON.parse(json);
            if (!!poi) {
                if ((new Date().getTime() / 1000 - poi.GPSTime) > 900)
                    redis.DEL(key);
            }
            cb && cb();
        });
    }
};

let _readLeftList = function (key, sn, cb) {
    redis.LLEN(key, function (err, len) {
        if (err) {
            console.log(err);
            cb && cb();
            return;
        }

        // data && redis.RPUSH(key, data, function (err, result) {
        if (len < 2) {
            // console.log(`${key} 未送到计算条件 第2个数据为空 ${len}`);
            // cb && cb();
            // 检查最后一个是否有效
            _checkLastValid(key, len, cb);
            return;
        }

        let now_time = Math.round(new Date().getTime() / 1000);
        let calc_time = _format_gt(now_time, calc_length);
        let calc_now_mid_time = now_time - calc_time;

        redis.LRANGE(key, 0, len, function (err, jsonArr) {
            try {
                let dataArray = [];
                for (let i = 0; i < jsonArr.length; i++) {
                    let _obj = JSON.parse(jsonArr[i]);
                    dataArray.push(_obj);
                }

                /**以下为测试内容**/
                let gn = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    // 不能出现 "时间排序出错" 如果出现，则表示有些地方出了问题
                    if (gn > dataArray[i].GPSTime) console.log(key + " : 按时间排序出错 i = " + i + " LEN : " + len);
                    gn = dataArray[i].GPSTime;
                }
                // console.log(key + " : " + JSON.stringify(test));
                /**测试结果表示读取是按时间顺序进行读取的**/
                /**测试内容结束**/
                let arr = [];
                for (let i = 0; i < dataArray.length; i++) {
                    let _obj = dataArray[i];
                    if (_obj.GPSTime <= calc_time) arr.push(_obj);
                }

                if (arr.length > 1) {
                    // console.log(`${key} 移除了 ${arr.length} 条数据，总长度: ${len} 还有 ${len - arr.length + 1}`);
                    redis.LTRIM(key, arr.length - 1, -1);

                    if (dataArray.length === arr.length) {
                        // 如果最后一条和现在相近，则不删除，如果较久，则删除
                        let mid = now_time - dataArray.last().GPSTime;
                        if (mid > calc_now_mid_time + calc_time) {
                            console.log(`${key} TIME ERROR : 与当前相隔 ${mid.toPadLeft(6)} : 最大相隔 ${calc_now_mid_time.toPadLeft(3)} : 相差 ${mid - calc_now_mid_time}`);
                        }
                    }

                    // 将针对arr进行数据处理
                    let hash = _calc_pack_mileage(_calcMiddleMileage(arr));
                    _do_save_mileage(hash, sn, calc_mid);
                }
                cb && cb(null, '1');
            } catch (e) {
                redis.DEL(key);
            }
        });
    });
};

const __buildDayList = (m, key, data) => {
    if (m === 0) {
        let expire = new Date().getTime() / 1000;
        expire = expire + (86400 - expire % 86400);
        return redis.execPromise('rpush', key, data)
            .then(redis.execPromise('expireat', key, expire))
    }
    return 1;
};

/***
 * 这里只进行数据存储
 * @param req
 * @param res
 * @param next
 */
let _doPost = function (req, res, next) {
    let data = req.body;
    let arr = [data];
    let sn = data.SerialNumber;
    if (util.isArray(data) && data.length > 0) {
        sn = data[0].SerialNumber;
        arr = data;
    }
    let p_data = arr.stringifyJSON().toString();
    if (!!sn) {
        let key = redisMileageList.concat(sn);
        let day = redisMileageDay.concat(sn);
        redis.execPromise('rpushx', day, p_data)
            .then((e) => __buildDayList(e, day, p_data))
            .then(redis.execPromise('rpush', key, p_data))
            .then(() => next())
            .catch(next);
    } else next();
};

let _doLocationPost = function (req, res, next) {
    let data = req.body;
    let sn = data.SerialNumber;
    let key = redisMileageList.concat(sn);
    // 暂时不处理里程
    next();
    // redis.execPromise('lrange', key, 0, -1)
    //     .then((msg) => {
    //     })
    //     .then(() => next())
    //     .catch(next);
};

let _doDayGet = (req, res, next) => {
    let {sn} = req.params;
    let day = redisMileageDay.concat(sn);
    redis.execPromise('lrange', day, 0, -1)
        .then(msg => {
            let ps = redis.ArrayToObject(msg);
            res.status(200).send('' + gpsUtil.GetLineDistance(ps));
        })
        .catch(err => res.status(500).send(err));
};

let doSingle = function (req, res, next) {
    let sn = req.params.sn;
    let key = redisMileageList.concat(sn);
    _readLeftList(key, sn);
    res.status(200).send("1");
};

/* GET users listing. */
router.get('/', demo);
router.post('/', _doPost);
router.post('/', _doLocationPost);
router.get('/day/:sn', _doDayGet);
router.post('/single/:sn', doSingle);

module.exports = router;