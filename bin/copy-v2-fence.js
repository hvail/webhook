/**
 * Created by hvail on 2017/9/26.
 */
const request = require('./../my_modules/request');
var area = process.env.DATAAREA || "zh-cn";
var util = require('util');
var myUtil = require('./../my_modules/utils');

var getFenceUrl = util.format("http://v2.local-api.%s.sky1088.com/GeoFence/GetFencesByTime/0", area);
var postFenceUrl = util.format("http://v3.res-mongo.local.%s.sky1088.com/fence", area);

/***
 * 数据模型
 */
var __FENCE_MODEL = {
    Name: "",
    Type: 0,
    Points: [],
    SerialNumber: "0000000000000000",
    IsEnter: 1,
    IsLevel: 1
}

var doPostNewUrl = function (data, i) {
    if (i >= data.length) {
        console.log("转移完成");
        return;
    }
    var ii = i || 0;
    var _tmp = data[ii];
    var _pps = _tmp.Points.split("_");
    var _data = myUtil.Clone(__FENCE_MODEL, _tmp);
    _data.Name = _tmp.FenceName;
    _data.Points = [
        {
            Lat: _pps[0].split(",")[0] * 1,
            Lng: _pps[0].split(",")[1] * 1
        }, {
            Lat: _pps[1].split(",")[0] * 1,
            Lng: _pps[1].split(",")[1] * 1
        }];
    _data.Coord = "WGS84";
    console.log(_data);
    ii++;
    request.Post(postFenceUrl, _data, function (err, _result) {
        console.log(_result);
        doPostNewUrl(data, ii);
    });
}

request.Post(getFenceUrl, {}, function (err, result) {
    var data = JSON.parse(result);
    // console.log(data.length);
    doPostNewUrl(data);
});
