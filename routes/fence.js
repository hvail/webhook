/**
 * Created by hvail on 2017/9/25.
 */

var express = require('express');
var request = require('./../my_modules/request');
var router = express.Router();
var area = process.env.DATAAREA || "zh-cn";

var fenceUrl = "http://v3.res-mongo.local." + area + ".sky1088.com/fence/sn/";

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
        var data = JSON.parse(result);
        // if (result.length < 1)return;
        console.log(pos.length);
        console.log(data.length);
    });
    res.send("1");
}

/* GET users listing. */
router.get('/');
router.post('/location', _location);

module.exports = router;

