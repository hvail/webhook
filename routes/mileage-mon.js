/***
 * 里程及处理部分
 * Created by hvail on 2017/10/27.
 */
const express = require('express');
const util = require('util');
const router = express.Router();
const mongo = require('./../my_modules/mongo');

const dbConfig = function (sn) {
    return {
        dbName: 'MileageResource',
        colName: `Mileage-${sn}`
    };
};

let demo = function (req, res, next) {
    res.send("mongo mileage 1.0.0");
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

let doPost = function (req, res) {
    let dataArray = req.body;
    if (!util.isArray(dataArray)) dataArray = [dataArray];
    let sn = dataArray[0].SerialNumber;
    let result = dataArray.length;
    for (let i = 0; i < result; i++) {
        let {SerialNumber, GPSTime} = dataArray[i];
        dataArray[i]._id = new mongo.ObjectID(SerialNumber.concat(GPSTime.toString(16)));
    }
    _addRange(dataArray, sn);
    res.status(200).send(result + '');
};

/* GET home page. */
router.get('/', demo);
// router.get('/last/:sn', getLast);
router.get('/range/:sn/:start/:end', getRangeMileage);

router.post('/', doPost);

module.exports = router;