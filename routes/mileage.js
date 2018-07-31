/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
const myUtil = require('./../my_modules/utils');
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const mongo = require('./../my_modules/mongo');
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
const redisMileageList = "list-run-mileage-";
const redisMileageDay = "day-mileage-";
const redisMileageHashKey = "hash-day-mileage-total";
const baiduSk = "inl7EljWEdaPIiDKoTHM3Z7QGMOsGTDT";
const baiduApiUrl = "http://api.map.baidu.com/direction/v2/driving";

const drivingApi = (origin, dest) => {
    return `${baiduApiUrl}?origin=${origin.Lat_Bd},${origin.Lng_Bd}&alternatives=1&destination=${dest.Lat_Bd},${dest.Lng_Bd}&ak=${baiduSk}`;
};

const dbConfig = function (sn) {
    return {
        dbName: 'MileageResource',
        colName: `Mileage-${sn}`
    };
};

let demo = function (req, res, next) {
    res.send('mileage v2.0.0');
};

const __buildDayList = (m, key, data) => {
    if (m === 0) {
        let expire = new Date().getTime() / 1000;
        // 默认8时区
        expire = expire + (86400 - expire % 86400) - (8 * 3600);
        return redis.execPromise('rpush', key, data)
            .then(redis.execPromise('expireat', key, expire))
    }
    return 1;
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

const __doPathSearch = (start, end, cnDis) => {
    let url = drivingApi(start, end);
    return myUtil.HttpGetPromise(url)
        .then((res) => res.result.routes)
        .then((routes) => {
            for (let i = 0; i < routes.length; i++) {
                let route = routes[i];
                let Rou_Dis = route.distance;
                let steps = route.steps;
                let arr = [];
                for (let k = 0; k < steps.length; k++) {
                    let path = steps[k].path;
                    let stepArr = path.split(';');
                    for (let j = 0; j < stepArr.length; j++) {
                        let sArr = stepArr[j].split(',');
                        let obj = {Lat: sArr[1], Lng: sArr[0]};
                        arr.push(obj);
                    }
                }
                let currDis = 999;
                let k = 0;
                for (; k < arr.length; k++) {
                    let ak = arr[k];
                    let dis = gpsUtil.GetDistance(ak.Lat, ak.Lng, end.Lat_Bd, end.Lng_Bd);
                    if (dis > currDis) break;
                    currDis = dis;
                }
                arr = arr.slice(0, k);
                arr.push({Lat: end.Lat_Bd, Lng: end.Lng_Bd});
            }
        });
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
        if (cTime - _st <= splitTime) {
            // console.log('当前正在运行');
            break;
        }
        if (ps[i].UpMode > 1) {
            // _cells.push(ps[i]);
            continue;
        }
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
        if (dis > 0) {
            keys.push(k);
        }
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
            // console.log(new Date(curr * 1000).FormatDate() + "/" + new Date(next * 1000).FormatDate() + " : " + gpsUtil.GetLineDistance([_parts[curr].last(), _parts[next].first()]));
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

let _addRange = function (dataArray, sn, isLoad) {
    mongo.add(dataArray, dbConfig(sn), function (err, data) {
        if (err) {
            // 如果是批量出错，则删除其出错的那行
            if (err.code === 11000) {
                let result = dataArray.length;
                // console.log(err.message + " -- " + result);
                for (let i = 0; i < result; i++) {
                    if (err.message.indexOf(dataArray[i]._id.toString()) > 0) {
                        mongo.del(mongo.GetByMasterId(dataArray[i]._id), dbConfig(sn));
                        break;
                    }
                }
                !isLoad && _addRange(dataArray, sn, true);
            } else {
                console.log(err.code);
                console.log(err);
            }
        }
    });
};

const __doMileage_Save = (dataArray) => {
    if (!util.isArray(dataArray)) dataArray = [dataArray];
    let sn = dataArray[0].SerialNumber;
    let result = dataArray.length;
    for (let i = 0; i < result; i++) {
        let {SerialNumber, GPSTime} = dataArray[i];
        dataArray[i]._id = new mongo.ObjectID(SerialNumber.concat(GPSTime.toString(16)));
    }
    _addRange(dataArray, sn);
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
    if (cPart && cPart.length > 0)
        __doMileage_Save(cPart);
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
    let p_data = [];
    for (let m = 0; m < arr.length; m++) {
        p_data.push(JSON.stringify(arr[m]).toString());
    }
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

const __List_Delete = (msg, key) => {
    let curr = new Date().getTime() / 1000;
    curr = curr - (curr % calc_mid) - calc_mid;
    let ps = redis.ArrayToObject(msg);
    if (!ps || !ps.length) return null;
    if (ps.last().GPSTime < curr) {
        redis.execPromise('del', key);
        console.log(`redis.execPromise('del', ${key});`);
    } else {
        let i = 0;
        for (; i < ps.length; i++) {
            let pp = ps[i];
            if (pp.GPSTime > curr) break;
        }
        if (i > 0)
            redis.execPromise('llen', key)
                .then((l) => {
                    console.log(`total : ${l} ::: redis.execPromise('ltrim', ${key}, ${i}, ${ps.length});`);
                    redis.execPromise('ltrim', key, i, ps.length);
                });
    }
    return msg;
};

let _doLocationPost = function (req, res, next) {
    let data = req.body;
    let sn = data.SerialNumber;
    if (util.isArray(data) && data.length > 0) sn = data[0].SerialNumber;
    let key = redisMileageList.concat(sn);
    redis.execPromise('lrange', key, 0, -1)
        .then(msg => {
            return __List_Delete(msg, key);
        })
        .then((msg) => {
            let ps = redis.ArrayToObject(msg);
            let dis = gpsUtil.GetLineDistance(ps);
            let hash = {SerialNumber: sn, Mileage: dis, TimeZone: 8, Curr: new Date().getTime() / 1000};
            redis.execPromise('hset', redisMileageHashKey, sn, JSON.stringify(hash));
            return msg;
        })
        .then((msg) => {
            let ps = redis.ArrayToObject(msg);
            return __doMileage(ps);
        })
        .then(() => next())
        .catch(next);
};

let _doDayGet = (req, res, next) => {
    let {sns} = req.params;
    let _sns = sns.split(',');
    redis.execPromise('hmget', redisMileageHashKey, _sns)
        .then(msg => {
            let ps = redis.ArrayToObject(msg);
            let result = [];
            let now = new Date().getTime() / 1000;
            now = now - (now % 86400);
            for (let i = 0; i < ps.length; i++) {
                let p = ps[i];
                if (p.Curr + p.TimeZone * 3600 > now) {
                    result.push(p);
                }
            }
            res.status(200).send(result);
        })
        .catch(err => {
            res.status(500).send(err);
        });
};

let doSingle = function (req, res, next) {
    let sn = req.params.sn;
    let key = redisMileageList.concat(sn);
    redis.execPromise('lrange', key, 0, -1)
        .then(msg => {
            return __List_Delete(msg, key);
        })
        .then((msg) => {
            let ps = redis.ArrayToObject(msg);
            if (ps && ps.length > 1) {
                return __doMileage(ps);
            }
        })
        .catch(console.log);
    res.send("1");
};

/***
 * 获取设备区间的里程
 * @param req
 * @param res
 * @param next
 */
let getRangeMileage = function (req, res, next) {
    let {sn, start, end} = req.params;
    let filter = {};
    filter.GPSTime = {"$gt": start * 1, "$lt": end * 1};
    let obj = dbConfig(sn);
    obj.sort = {"GPSTime": 1};
    mongo.find(filter, obj, function (err, data) {
        if (err || !data || data.length < 1)
            res.send("[]");
        else {
            let result = [];
            for (let i = 0; i < data.length; i++) {
                let di = data[i];
                let ip = 1;
                for (let j = 0; j < result.length; j++) {
                    let ri = result[j];
                    if (ri.GPSTime === di.GPSTime) {
                        ip = 0;
                        break;
                    }
                }
                if (ip) result.push(di);
            }
            res.send(result);
        }
    });
};

/* GET users listing. */
router.get('/', demo);
router.post('/', _doPost);
router.post('/', _doLocationPost);
router.get('/day/:sns', _doDayGet);
router.get('/clear/:sn', doSingle);
// router.get('/last/:sn', getLast);
router.get('/range/:sn/:start/:end', getRangeMileage);

module.exports = router;