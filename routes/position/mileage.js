/**
 * Created by hvail on 2018/9/12.
 */
const express = require('express');
const request = require('request');

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
            .then((e) => __buildDayList(e, day, p_data))
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
        .then(() => next())
        .catch(next);
};

router.post('/', _doPost);
router.post('/', _doLocationPost);

const router = express.Router();