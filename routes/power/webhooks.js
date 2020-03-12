/**
 * Created by hvail on 2018/9/11.
 */
const express = require('express');
const request = require('request');
let {util: apiUtil} = require('api-base-hvail');
const router = express.Router();
const log4js = require('log4js');
const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Power`;
let logger = log4js.getLogger('normal');

const doWebPush = function (url, data) {
    for (let j = 0; j < data.length; j++) {
        apiUtil.PromisePost(url, data[j])
            .then(ss => logger.info(`${url} , 200 (${JSON.stringify(ss)}) INFO : (${JSON.stringify(data[j])})`))
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