/**
 * Created by hvail on 2018/9/11.
 */
const express = require('express');
const request = require('request');
let {util: apiUtil} = require('api-base-hvail');
const router = express.Router();
const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Power`;
const doWebPush = function (url, data) {
    for (let j = 0; j < data.length; j++) {
        apiUtil.PromisePost(url, data[j])
            .then(ss => console.log(url + " : (" + JSON.stringify(data) + ")"))
            .catch(e => console.log(url + ":" + e));
    }
};
const _location = (req, res, next) => {
    let pos = req.body;
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;
    let url = `${getWebhookUrl}/${sn}`;
    if (!sn) {
        console.log(_pos);
    } else
        doWebPush("http://hdapi.zcyxcn.com/rest/seal/addSealBattery", _pos);
    next();
};
router.get('/');
router.post('/', _location);

module.exports = router;