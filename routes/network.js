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
    redis.HDEL(NetworkHashTableName, data.ConnectionId);
};

let _doMatchDevice = function (data) {
    redis.HGET(NetworkHashTableName, data.ConnectionId, function (err, result) {
        console.log(data);
        console.log(result);
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