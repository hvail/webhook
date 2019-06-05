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
const mq_url = `http://v3.mq-rabbit.server.${area}.sky1088.com/mileage/single`;
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

const _addRange = (arr) => {
    if (!arr) return;
    if (!Array.isArray(arr)) arr = [arr];
    apiUtil.PromisePost(mq_url, arr)
        .then(msg => console.log(`${mq_url} :: ${msg}`))
        .catch(e => console.log(e));
};

const _filterPos = (previous, current) => {
    if (!previous) return true;
    if(current.UpMode === 2) return false;
    // 计算时间差
    let m_t = current.GPSTime - previous.GPSTime;
    // 计算距离差
    let m_d = gpsUtil.GetDistance(previous.Lat, previous.Lng, current.Lat, current.Lng);
    // 速度计算单位(米/秒)
    let speed = m_d / m_t;
    return speed <= 100;

};

const _doRunLocations = (arr, sn) => {
    // 这里先对arr进行过滤
    let _arr = [];
    for (let i = 1; i < arr.length; i++) {
        if (_filterPos(arr[i - 1], arr[i])) {
            _arr.push(arr[i]);
        }
    }
    let result = {
        SerialNumber: sn,
        MaxSpeed: 0,
        StartTime: _arr.first().GPSTime,
        EndTime: _arr.last().GPSTime,
        Distance: gpsUtil.GetLineDistance(_arr),
        PointCount: arr.length,
        Type: "MileageCalc",
    };
    result.MiddleTime = result.EndTime - result.StartTime;
    result.GPSTime = result.StartTime;
    result.Speed = (result.Distance / result.MiddleTime * 3.6).toFixed(3) + " km/h";
    // console.log(JSON.stringify(result));
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
        .then(_is => (_is ?
            redis.execPromise('expire', key, _timerLength) :
            redis.execPromise('set', key, new Date().getTime()).then(() => (redis.execPromise('expire', key, _timerLength)))));
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