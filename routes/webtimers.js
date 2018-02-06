/***
 * Created by hvail on 2017/10/21.
 */
const schedule = require("node-schedule");
const express = require('express');
const myUtil = require('./../my_modules/utils');
const router = express.Router();
//language=JSRegexp
const endTimePatten = /^(.*)-(.*)-(.*)T(.*):(.*):.*$/;
const monthDay = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

let demo = {
    Name: "TimerDemo",
    // 开始时间
    Start: 0,
    // 结束时间
    End: 0,
    // 时区
    TimeZone: 8,
    // 执行时段
    Spec: "2018-02-06T04:.*:00Z",
    // 共执行次数
    Count: 0,
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
        if ($2 === ".*") {
            ed.setYear(sd.getFullYear() + 1);
            ed = new Date(`${ed.getFullYear()}-01-01T00:00:00Z`);
        } else if ($3 === ".*") {
            ed.setMonth(sd.getMonth() + 1);
            ed = new Date(`${ed.getYear()}-${ed.getMonth()}-01T00:00:00Z`);
        } else if ($4 === ".*") {
            ed.setDate(sd.getDate() + 1);
            ed = new Date(`${ed.getYear()}-${ed.getMonth()}-${ed.getDate()}T00:00:00Z`);
        } else if ($5 === ".*") {
            ed.setHours(sd.getHours() + 1);
            ed = new Date(`${ed.getYear()}-${ed.getMonth()}-${ed.getDate()}T${ed.getHours()}:00:00Z`);
        }
    }
    return {Start: sd.getTime() / 1000, End: ed.getTime() / 1000};
};

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

// console.log(_execSpecRunTime(demo.Spec));
// console.log(_execSpecCount(demo.Spec));
// console.log(endTimePatten.test(demo.Spec));

// let json = JSON.stringify(demo);
// console.log(json);
// console.log(eval(JSON.parse(json).Spec).test(new Date().toISOString()));

let _doRunCommand = function (req, res, next) {
    console.log('YES I DO ' + (new Date().toISOString()));
    res.send('YES I DO ' + (new Date().toISOString()));
};

let _getDefault = function (req, res, next) {
    res.send('respond with a time request');
};

/* GET users listing. */
router.get('/', _getDefault);
// 开始行动的指令，来源是定时器发出的
router.get('/run', _doRunCommand);

// schedule.scheduleJob('*/2 * * * * *', function () {
//     console.log('The answer to life, the universe, and everything!');
// });

module.exports = router;
