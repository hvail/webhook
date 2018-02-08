/***
 * Created by hvail on 2017/10/21.
 */
const schedule = require("node-schedule");
const express = require('express');
const redis = require('./../my_modules/redishelp');
const myUtil = require('./../my_modules/utils');
const router = express.Router();
const endTimePatten = /^(.*)-(.*)-(.*)T(.*):(.*):.*$/;
const monthDay = [31, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// 记录开始时间的sortedSet
const key_sSet_start = "SSET-spark-do-timer-start";
// 记录结束时间的sortedSet
const key_sSet_end = "SSET-spark-do-timer-end";
// 记录操作任务的Hash
const key_Hash_job = "Hash-spark-do-timer-job";

let edTime = new Date('3000-01-01T00:00:00Z').getTime() / 1000;

let demo = {
    // 任务名(req,only)
    Name: "TimerDemo",
    // 开始时间
    Start: 0,
    // 结束时间
    End: 0,
    // 时区(req)
    TimeZone: 8,
    // 执行时段(req)
    Spec: "2018-02-06T04:.*:00Z",
    // 共执行次数
    Count: 0,
    // 最近执行的时间，以此来判断是否会有重复执行
    DoTime: 0,
    // 网络请求详细(req)
    Hooks: {
        Url: "www.sky1088.com",
        Data: "{a=1,b=2,c=3}",
        Headers: ["Token=null"],
        SSLKey: null,
        SSLCert: null
    }
};

let _execSpecRunTime = function (Spec) {
    let patten = endTimePatten.test(Spec);
    if (!patten) return {Start: -1, End: -1};
    // 时长设定1000年
    let sd = new Date('1999-12-31T23:59:59Z'), ed = new Date('2999-12-31T23:59:59Z');
    let {$1, $2, $3, $4, $5} = RegExp;
    if ($1 !== ".*") {
        let month = ($2 * 1 || 1).toPadLeft(2), day = ($3 * 1 || 1).toPadLeft(2),
            hours = ($4 * 1 || 0).toPadLeft(2), min = ($5 * 1 || 0).toPadLeft(2);
        sd = new Date(`${$1}-${month}-${day}T${hours}:${min}:00Z`);
        // 直接相等会直接复制内存堆，这样两个值怎么修改都一样。
        ed = new Date(sd.toISOString());
        if ($2 === ".*") {
            ed.setYear(sd.getFullYear() + 1);
        } else if ($3 === ".*") {
            ed.setMonth(sd.getMonth() + 1);
        } else if ($4 === ".*") {
            ed.setDate(sd.getDate() + 1);
        } else if ($5 === ".*") {
            ed.setHours(sd.getHours() + 1);
        }
    }
    return {Start: sd.getTime() / 1000, End: ed.getTime() / 1000};
};

// console.log(_execSpecRunTime("2018-02-.*T.*:00:00Z"));

let _execSpecCount = function (Spec) {
    let patten = endTimePatten.test(Spec);
    // 共5个字段
    if (!patten) return -1;
    let {$1, $2, $3, $4, $5} = RegExp;
    let cc = 1;
    if ($1 === ".*") return 9999999;
    if ($5 === ".*") {
        cc = cc * 60;
    }
    if ($4 === ".*") {
        cc = cc * 24;
    }
    if ($2 === ".*") {
        cc = cc * (($3 === ".*") ? 365 : 12);
    } else if ($3 === ".*") {
        cc = cc * monthDay[$2 * 1];
    }
    return cc;
};

let _doJobEnd = function () {
    // 这里是删除过期的任务，并将其记录到数据库中。
    // console.log("_doJobEnd");
    if (arguments.length === 1) {
        console.log(arguments[0]);
    }
};

let _doJobBegin = function (objs, DateString, i) {
    let ii = i || 0;
    if (ii === objs.length) {
        _doJobEnd();
        return;
    }
    let obj = JSON.parse(objs[ii]);
    if (obj === null) return;
    if (eval("/" + obj.Spec + "/").test(DateString)) {
        // 如果符合条件就向其发送数据
        myUtil.DoPushPost(obj.Hooks, obj.Hooks.Data);
    } else {
        if (ii++ === objs.length - 1) {
            _doJobEnd();
        } else {
            _doJobBegin(objs, DateString, ii);
        }
    }
};

let _doRunCommand = function (req, res, next) {
    let DateTime = new Date();
    let DateString = DateTime.toISOString();
    let runtime = DateTime.getTime() / 1000;
    // 查找在此之前开始的所有key，和在此之后才结束的所有key
    // let range = redis.execPromise('ZRANGEBYSCORE', key_sSet_start, 0, runtime, function (err, _start) {
    //     if (err || !_start || !_start.length) {
    //         _doJobEnd(err);
    //     } else {
    //         redis.ZRANGEBYSCORE(key_sSet_end, runtime, edTime, function (err, _end) {
    //             if (err || !_end || !_end.length) {
    //                 _doJobEnd(err);
    //             } else {
    //                 let arr = _start.intersection(_end);
    //                 redis.HMGET(key_Hash_job, arr, function (err, _result) {
    //                     if (err || !_result || !_result.length) {
    //                         _doJobEnd(err);
    //                     } else {
    //                         _doJobBegin(_result, DateString);
    //                     }
    //                 });
    //             }
    //         });
    //     }
    // });
    // ************************* 这里使用Promise 写法进行 ***************************///
    let _start = redis.execPromise("ZRANGEBYSCORE", key_sSet_start, 0, runtime);
    let _end = redis.execPromise("ZRANGEBYSCORE", key_sSet_end, runtime, edTime);

    _start.then((_startData) => _end.then(function (_endData) {
        let arr = _startData.intersection(_endData);
        if (!arr || arr.length === 0) {
            _doJobEnd();
        } else {
            console.log(arr);
            let _doJobs = (arr.length === 1) ?
                redis.execPromise("HGET", key_Hash_job, arr[0]) : redis.execPromise("HMGET", key_Hash_job, arr);
            _doJobs.then(_resultData => _doJobBegin(_resultData, DateString))
                .catch(_doJobEnd);
        }
    }));
    _start.catch(_doJobEnd);
    _end.catch(_doJobEnd);

    // redis.HMGET(key_Hash_job,)
    // let _getJobs = redis.execPromise("HMGET", key_Hash_job, arr);
    // console.log(range);
    // res.status(200).send("YES I DO COMMANDER " + DateString);
};

_doRunCommand();

let _getDefault = function (req, res, next) {
    res.send('respond with a time request');
};

// 添加一个定时任务
let _doJobPost = function (req, res, next) {
    let {Name, Spec, TimeZone, Hooks} = req.body;
    let data = req.body;
    // 首先查看名称是否被注册了
    redis.HEXISTS(key_Hash_job, Name, function (err, exists) {
        res.status(200).send(exists ? "Error : 任务名已经被注册了" : "YES");
        if (exists) return;
        let count = _execSpecCount(Spec);
        if (count === -1) return;
        let run = _execSpecRunTime(Spec);
        data.Start = run.Start;
        data.End = run.End;
        data.Count = count;
        redis.ZADD(key_sSet_start, run.Start, Name);
        redis.ZADD(key_sSet_end, run.End, Name);
        redis.HSET(key_Hash_job, Name, JSON.stringify(data));
    });
};

let _doJobCancel = function (req, res, next) {
    let {name} = req.params;
    redis.ZREM(key_sSet_start, name);
    redis.ZREM(key_sSet_end, name);
    redis.HDEL(key_Hash_job, name);
    res.status(200).send("YOU JOB WILL CANCEL");
};

/* GET users listing. */
router.get('/', _getDefault);
// 开始行动的指令，来源是定时器发出的
router.get('/run', _doRunCommand);

// 添加任务
router.post('/', _doJobPost);
// 取消任务
router.delete('/:name', _doJobCancel);

module.exports = router;
