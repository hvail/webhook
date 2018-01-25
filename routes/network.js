/***
 * 设备网络上下线推送
 * Created by hvail on 2017/10/17.
 */
const express = require('express');
const router = express.Router();
const redis = require('./../my_modules/redishelp');
const myUtil = require('./../my_modules/utils');

const NetworkHashTableName = "HASH-spark-net-work-conn";
const DeviceHashTableName = "HASH-spark-net-work-device";

const CONNECTION_PUSH_EXCHANGE = "hyz.runtime.connection";

// const DeviceNetWorkPostUrl = `http://v3.res.server.${process.env.DATAAREA}.sky1088.com/network`;

let _doOpenNet = function (data) {
    redis.HSET(NetworkHashTableName, data.ConnectionId, JSON.stringify(data));
};

let _doCloseNet = function (data) {
    let id = data.ConnectionId;
    redis.HGET(NetworkHashTableName, id, function (err, _result) {
        redis.HDEL(NetworkHashTableName, id);
        // 如果这个连接没有机身号，则放弃此链接即可
        let result = JSON.parse(_result);
        if (!result || !result.SerialNumber) return;
        let sn = result.SerialNumber;
        let pushObj = {
            SerialNumber: sn,
            ConnectionStart: result.Time,
            ConnectionEnd: data.Time,
            HashId: id
        };
        redis.HGET(DeviceHashTableName, sn, function (err, connId) {
            if (connId !== id) {
                // console.log(`${sn} 变更了链接关 -1`);
                pushObj.Status = -1;
                myUtil.SendMqObject(CONNECTION_PUSH_EXCHANGE, pushObj, sn);
            } else {
                // console.log(`${sn} 关闭了链接 0`);
                pushObj.Status = 0;
                myUtil.SendMqObject(CONNECTION_PUSH_EXCHANGE, pushObj, sn);
                redis.HDEL(DeviceHashTableName, sn);
            }
        });
    });
};

let _doMatchDevice = function (data) {
    redis.HGET(NetworkHashTableName, data.ConnectionId, function (err, _result) {
        // 如果链接不存在，则放弃所有操作
        if (!_result) return;
        let result = JSON.parse(_result);
        if (!result || result.SerialNumber === data.SerialNumber) return;

        let sn = data.SerialNumber;
        let id = data.ConnectionId;

        let pushObj = {
            SerialNumber: sn,
            ConnectionStart: result.Time,
            HashId: id
        };
        // 查询设备链接表中是否存在有关此设备的记录
        redis.HGET(DeviceHashTableName, sn, function (err, deviceLink) {
            if (deviceLink === id) return;
            if (!deviceLink) {
                // 新建链接
                // console.log(`${sn} 新建了链接 1`);
                pushObj.Status = 1;
                myUtil.SendMqObject(CONNECTION_PUSH_EXCHANGE, pushObj, sn);
            } else {
                // 更换链接开
                // console.log(`${sn} 变更了链接开 2`);
                pushObj.Status = 2;
                myUtil.SendMqObject(CONNECTION_PUSH_EXCHANGE, pushObj, sn);
            }
            redis.HSET(DeviceHashTableName, sn, id);
        });
        result.SerialNumber = data.SerialNumber;
        redis.HSET(NetworkHashTableName, id, JSON.stringify(result));
    });
};

let _doPost = function (req, res, next) {
    let {body} = req;
    if (body.Status === 1) {
        _doOpenNet(body);
    } else if (body.Status === 0) {
        _doCloseNet(body);
    } else if (body.Status === 2) {
        _doMatchDevice(body);
    }
    res.status(200).send('1');
};

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource by network');
});

router.post('/', _doPost);

module.exports = router;