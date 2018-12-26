/**
 * Created by hvail on 2018/9/11.
 */
const express = require('express');
const request = require('request');
let {util: apiUtil} = require('api-base-hvail');
const router = express.Router();
const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Position`;
const doWebPush = function (arr, data) {
    // console.log(arr);
    for (let i = 0; i < arr.length; i++)
        if (arr[i]) {
            for (let j = 0; j < data.length; j++) {
                if (arr[i] && arr[i].Url)
                    apiUtil.PromisePost(arr[i].Url, data[j])
                        .catch(e => console.log(arr[i].Url + ":" + e));
            }
        } else console.log(data);
};
const _location = (req, res, next) => {
    let pos = req.body;
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;
    let url = `${getWebhookUrl}/${sn}`;
    // console.log(url);
    apiUtil.PromiseGet(url).then(JSON.parse)
        .then(arr => (arr && arr.length) && doWebPush(arr, _pos))
        .catch(e => console.log(`${url} \r\n${e}`));
    next();
};
router.get('/');
router.post('/', _location);

module.exports = router;