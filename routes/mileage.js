/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const request = require('request');
const express = require('express');
const apiBase = require('api-base-hvail');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const {util: apiUtil} = apiBase;

const calc_mid = 5 * 60;              // 计算间隔5分钟
const calc_length = 2 * calc_mid;    // 单次读取长度,2个计算周期 10分钟计算一次以减少系统压力和提高响应速度
const mq_url = `http://v3.mq-rabbit.server.${area}.sky1088.com/data`;
// 存储规则为右进左出
// RPUSH & LRANGE
const redisMileageList = "list-run-mileage-";
const redisMileageDay = "day-mileage-";
const redisMileageHashKey = "hash-day-mileage-total";
const baiduSk = "inl7EljWEdaPIiDKoTHM3Z7QGMOsGTDT";
const baiduApiUrl = "http://api.map.baidu.com/direction/v2/driving";

let demo = function (req, res, next) {
    res.send('mileage v2.0.0');
};

/***
 * 排序并去重
 * @param ps
 * @returns {Array}
 * @private
 */
const __doMileage_Sort = (ps) => {
    let result = [];
    let _res = ps.sort((a, b) => a.GPSTime > b.GPSTime ? 1 : -1);
    let _currTime = 0;
    for (let i = 0; i < _res.length; i++) {
        let currPoint = _res[i];
        if (currPoint.GPSTime > _currTime) {
            result.push(currPoint);
            _currTime = currPoint.GPSTime;
        }
    }
    return result;
};

/***
 * 里程条件计算
 * @param ps
 * @returns {boolean}
 * @private
 */
const __doMileage_IsMileage = (ps) => {
    let curr = new Date().getTime() / 1000;
    let fTime = ps.first().GPSTime, eTime = ps.last().GPSTime;
    if (curr - fTime > 900) return true;
    // console.log((new Date().getTime() / 1000) - ps.first().GPSTime);
    // console.log((new Date().getTime() / 1000) - ps.last().GPSTime);
    // 里程符合条件 （ a: 初始点时间到当前时间大于10分钟）
    return false;
};

const __doMileage_findTimePoint = (start, end) => {
    let mt = end.GPSTime - start.GPSTime;
    let dmLat = (end.Lat - start.Lat) / mt, dmLng = (end.Lng - start.Lng) / mt;
    let ms = end.GPSTime - (end.GPSTime % calc_mid);
    // mLat mLng 表示的是相差值
    let mLat = (ms - start.GPSTime) * dmLat, mLng = (end.GPSTime - ms) * dmLng;
    let result = myUtil.Clone(end, {});
    result.GPSTime = ms;
    result.Lat = start.Lat + mLat;
    result.Lng = start.Lng + mLng;
    return result;
};

/***
 * 按时间进行分割
 * @param ps
 * @private
 */
const __doMileage_SplitTime = (ps) => {
    // 5 分钟分割式
    let _parts = {};
    let cTime = new Date().getTime() / 1000;
    let splitTime = calc_mid;
    for (let i = 0; i < ps.length; i++) {
        let gt = ps[i].GPSTime;
        let _st = gt - (gt % splitTime);
        if (cTime - _st <= splitTime) break;
        if (!_parts[_st]) _parts[_st] = [];
        _parts[_st].push(ps[i]);
    }
    let keys = [];
    for (let k in _parts) {
        if ((cTime - k * 1) < splitTime) {
            _parts[k] = null;
            continue;
        }
        let dis = gpsUtil.GetLineDistance(_parts[k]);
        if (dis > 0) keys.push(k);
    }
    for (let i = 0; i < keys.length - 1; i++) {
        let curr = keys[i], next = keys[i + 1];
        let _last = _parts[curr].last(), _next = _parts[next].first();
        if (next - curr > calc_mid) {
            // 如果两段之间时间相差大于5分钟
            // 计算此段最后点和下段初始点的距离
            let cnDis = gpsUtil.GetLineDistance([_last, _next]);
            if (cnDis < calc_mid) {
                // 如果距离小于 calc_mid(300) 则直接将此段最后点写入到下段的起始点
                let nextFirst = myUtil.Clone(_last, {});
                nextFirst.GPSTime = next;
                _parts[next].insert(0, nextFirst);
                // } else if (cnDis < 1000) {
                // 如果距离小于1000 则计算其运行路线(要求异步，难度较高，后定)
                // __doPathSearch(_last, _next, cnDis);
            }
        } else {
            // 如果两段之间时间相邻近，找寻中间点
            let md = __doMileage_findTimePoint(_last, _next);
            _parts[curr].push(md);
            _parts[next].insert(0, md);
        }
    }
    return _parts;
};

const __doMileage_CalcPart = (part) => {
    let result = [];
    for (let k in part) {
        if (part.hasOwnProperty(k)) {
            let _part = part[k];
            let sn = _part.first().SerialNumber;
            let obj = {
                Distance: gpsUtil.GetLineDistance(_part),
                PointCount: _part.length - 1,
                GPSTime: k * 1,
                SerialNumber: sn,
                MiddleTime: calc_mid,
                TimeString: new Date(k * 1000).FormatDate(4),
                MaxSpeed: _part.max('Speed').toFixed(3) + " km/h"
            };
            obj.Speed = (obj.Distance / calc_mid * 3.6).toFixed(3) + " km/h";
            result.push(obj);
        }
    }
    return result;
};

const _addRange = (arr) => {
    arr = arr.map(p => {
        p.Type = "MileageCalc";
        return p;
    });
    apiUtil.PromisePost(mq_url, arr)
        .then(msg => console.log(`${mq_url} :: ${msg}`))
        .catch(e => console.log(e));
};

const __doMileage_Save = (dataArray) => {
    if (!util.isArray(dataArray)) dataArray = [dataArray];
    let sn = dataArray[0].SerialNumber;
    dataArray = dataArray.filter(d => d.Distance > 10);
    if (dataArray.length > 0) _addRange(dataArray, sn);
};

const __doMileage = (ps) => {
    // 1 按时间排序并删除重复数据
    let _ps = __doMileage_Sort(ps);
    // 2 计算是否符合里程计算要求
    if (!__doMileage_IsMileage(_ps)) return -1;
    // 3 数据点按5分钟进行分割
    let part = __doMileage_SplitTime(_ps);
    // 4 计算和封装段
    let cPart = __doMileage_CalcPart(part);
    // 5 将每一段都写到数据库中
    if (cPart && cPart.length > 0) __doMileage_Save(cPart);
    return part;
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
    let p_data = arr.map(o => (JSON.stringify(o)));
    if (!!sn) {
        let key = redisMileageList.concat(sn);
        let day = redisMileageDay.concat(sn);
        redis.execPromise('rpushx', day, p_data)
        // .then((e) => __buildDayList(e, day, p_data))
            .then(() => redis.execPromise('rpush', key, p_data))
            .then(() => next())
            .catch(next);
    } else next();
};

let _doLocationPost = function (req, res, next) {
    let data = req.body;
    let sn = data.SerialNumber;
    if (util.isArray(data) && data.length > 0) sn = data[0].SerialNumber;
    let key = redisMileageList.concat(sn);
    redis.execPromise('lrange', key, 0, -1)
        .then(msg => (redis.ArrayToObject(msg)))
        .then(ps => (__List_Delete(ps, key)))
        .then(ps => ( __doMileage(ps)))
        .catch(e => console.log(e));
    res.send("1");
};

// 倒计时里程算法
// 15分钟为一区间里程
const _timerLength = 900;
const _timerMileage = (req, res, next) => {
    let data = req.body;
    if (!Array.isArray(data)) data = [data];
    let sn = data.first().SerialNumber;
    // 设置或修改计时器
    let timerKey = `Mileage_Timer_${sn}`;
    redis.execPromise('exists', timerKey)
        .then(_is => {
            if (_is) console.log(`${timerKey} 存在`);
            else console.log(`${timerKey} 存在`);
        });
    // redis.execPromise('expire', _timerLength);
    next();
};

const __List_Delete = (ps, key) => {
    let curr = new Date().getTime() / 1000;
    curr = curr - (curr % calc_mid) - calc_mid;
    if (!ps) return null;
    if (ps.last().GPSTime < curr || ps.length.length === 0) {
        redis.execPromise('del', key);
    } else {
        let i = 0;
        for (; i < ps.length; i++) {
            let pp = ps[i];
            if (pp.GPSTime > curr) break;
        }
        if (i > 0)
            redis.execPromise('llen', key)
                .then((l) => {
                    // myUtil.logger(`total : ${l} ::: redis.execPromise('ltrim', ${key}, ${i}, ${ps.length});`);
                    redis.execPromise('ltrim', key, i, ps.length);
                });
    }
    return ps;
};

/* GET users listing. */
router.get('/', demo);
router.post('/', _doPost);
router.post('/', _timerMileage);
router.post('/', _doLocationPost);

module.exports = router;