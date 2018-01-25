/***
 * 设备网络上下线推送
 * Created by hvail on 2017/10/17.
 */
const express = require('express');
const router = express.Router();
const redis = require('./../my_modules/redishelp');

const NetworkHashTableName = "HASH-spark-net-work-conn";
const DeviceHashTableName = "HASH-spark-net-work-device";

let _doOpenNet = function (data) {
    redis.HSET(NetworkHashTableName, data.ConnectionId, JSON.stringify(data));
};

let _doCloseNet = function (data) {
    redis.HGET(NetworkHashTableName, data.ConnectionId, function (err, result) {
        redis.HDEL(NetworkHashTableName, data.ConnectionId);
        // 如果这个连接没有机身号，则放弃此链接即可
        if (!result || !result.SerialNumber) return;
        let sn = result.SerialNumber;

        redis.HGET(DeviceHashTableName, sn, function (err, obj) {
            if (obj !== result.ConnectionId) {
                console.log(`${sn} 变更了链接关`);
            } else {
                console.log(`${sn} 关闭了链接`);
                redis.HDEL(DeviceHashTableName, sn);
            }
        });
    });
};

let _doMatchDevice = function (data) {
    redis.HGET(NetworkHashTableName, data.ConnectionId, function (err, result) {
        // 如果链接不存在，则放弃所有操作
        if (!result) return;
        result.SerialNumber = data.SerialNumber;

        // 查询设备链接表中是否存在有关此设备的记录
        redis.HGET(DeviceHashTableName, data.SerialNumber, function (err, deviceLink) {
            if (deviceLink) {
                if (deviceLink === data.ConnectionId) return;
                console.log(`${data.SerialNumber} 变更了链接开`)
            } else
                console.log(`${data.SerialNumber} 开启了链接`);
            redis.HSET(DeviceHashTableName, data.SerialNumber, data.ConnectionId);
        });
        redis.HSET(NetworkHashTableName, data.ConnectionId, JSON.stringify(data));
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