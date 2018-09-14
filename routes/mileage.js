/***
 * 里程的计算
 * Created by hvail on 2017/10/27.
 */
const gpsUtil = require('./../my_modules/gpsutils');
const redis = require('./../my_modules/redishelp');
const request = require('request');
const express = require('express');
const util = require('util');
const router = express.Router();
const area = process.env.DATAAREA || "zh-cn";

const {util: apiUtil} = require('api-base-hvail');

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

// 设置或修改计时器
const timerKey = "Mileage_Timer";
const listKey = "Mileage_Position_List";
// 15分钟为一区间里程
const _timerLength = 900;

let demo = function (req, res, next) {
    res.send('mileage v2.0.0');
};

const __doMileage_findTimePoint = (start, end) => {
    let mt = end.GPSTime - start.GPSTime;
    let dmLat = (end.Lat - start.Lat) / mt, dmLng = (end.Lng - start.Lng) / mt;
    let ms = end.GPSTime - (end.GPSTime % calc_mid);
    // mLat mLng 表示的是相差值
    let mLat = (ms - start.GPSTime) * dmLat, mLng = (end.GPSTime - ms) * dmLng;
    let result = Object.assign({}, end);
    result.GPSTime = ms;
    result.Lat = start.Lat + mLat;
    result.Lng = start.Lng + mLng;
    return result;
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
    if (!arr) return;
    if (!Array.isArray(arr)) arr = [arr];
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

const _doRunLocations = (arr, sn) => {
    let result = {
        SerialNumber: sn,
        MaxSpeed: arr.max('Speed').toFixed(3),
        StartTime: arr.first().GPSTime,
        EndTime: arr.last().GPSTime,
        Distance: gpsUtil.GetLineDistance(arr),
        PointCount: arr.length,
        Type: "MileageCalc",
    };
    result.MiddleTime = result.EndTime - result.StartTime;
    result.GPSTime = result.StartTime;
    result.Speed = result.Distance / result.MiddleTime * 3.6;
    console.log(JSON.stringify(result));
    return result;
};

const _doList = (req, res, next) => {
    let data = req.body;
    if (!Array.isArray(data)) data = [data];
    let sn = data.first().SerialNumber;
    // 此处只处理存放到Redis中即可
    let key = `${listKey}_${sn}`;
    let p_data = data.map(o => (JSON.stringify(o)));
    redis.execPromise('rpush', key, p_data);
    next();
};

// 倒计时里程算法
const _timerMileage = (req, res, next) => {
    let data = req.body;
    if (!Array.isArray(data)) data = [data];
    let sn = data.first().SerialNumber;
    let key = `${timerKey}_${sn}`;
    redis.execPromise('exists', key)
        .then(_is => {
            if (_is) {
                // console.log(`${key} 存在`);
                return redis.execPromise('expire', key, _timerLength);
            } else {
                // console.log(`${key} 不存在`);
                return redis.execPromise('set', key, new Date().getTime())
                    .then(() => (redis.execPromise('expire', key, _timerLength)));
            }
        });
    res.send("1");
};

const _calcMileage = (req, res, next) => {
    let {SerialNumber: sn} = req.body;
    // 收到到期通知，表示这段里程已经结束
    // 读取列表LIST，进行里程换算
    let key = `${listKey}_${sn}`;
    redis.execPromise('lrange', key, 0, -1)
        .then(msg => (redis.ArrayToObject(msg)))
        .then(arr => {
            if (arr.length > 1) {
                console.log(`${sn} 开始执行里程计算 开始: ${arr.first().GPSTime} , 结束: ${arr.last().GPSTime} , 数量: ${arr.length}`);
                return _doRunLocations(arr, sn);
            }
        })
        .then(result => _addRange(result))
        .then(() => redis.execPromise('del', key))
        .catch(e => console.log('_calcMileage ' + e));
    res.send("1");
};

/* GET users listing. */
router.get('/', demo);
router.post('/', _doList);
router.post('/', _timerMileage);
router.post('/clear', _calcMileage);

module.exports = router;