/**
 * Created by hvail on 2017/9/25.
 */

var express = require('express');
var request = require('./../my_modules/request');
var gpsUtil = require('./../my_modules/gpsutils');
var router = express.Router();
var area = process.env.DATAAREA || "zh-cn";

var fenceUrl = "http://v3.res-mongo.local." + area + ".sky1088.com/fence/sn/";
const FenceTypeEnum = [null, gpsUtil.IsPointInCircle, gpsUtil.IsPointInRect, gpsUtil.IsPointInPolygon];

var trigger = function (ps, fence) {
    var fp = ps[0];
    var _fenceCalc = FenceTypeEnum[fence.Type];
    var _io_f = _fenceCalc(fence.Points, fp.Lat, fp.Lng);

}

var _location = function (req, res, next) {
    var pos = req.body;
    if (!pos) {
        res.send('0');
        return;
    }
    var _pos = [];
    for (var i = 0; i < pos.length; i++)
        if (pos[i] && pos[i] != "null")
            _pos.push(pos[i]);
    pos = _pos;
    var sn = pos[0].SerialNumber;
    var getFenceUrl = fenceUrl + sn;

    request.Get(getFenceUrl, function (err, result) {
        var fences = JSON.parse(result);
        if (fences.length < 1 || pos.length < 2) return;
        console.log(pos[0]);
        for (var i = 0; i < fences.length; i++) {
            trigger(pos, fences[i]);
        }
        // console.log(pos.length);
        // console.log(fences.length);
    });
    res.send("1");
}

/* GET users listing. */
router.get('/');
router.post('/location', _location);

module.exports = router;

