/**
 * Created by hvail on 2018/9/4.
 */
let express = require('express');
let request = require('request');
let {util: apiUtil} = require('api-base-hvail');
let router = express.Router();

const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Event`;

let getDemo = function (req, res, next) {
    res.send('alarm push system 1.2.0.0');
};

const doWebPush = function (arr, data) {
    console.log(data);
    for (let i = 0; i < arr.length; i++)
        for (let j = 0; j < data.length; j++) {
            apiUtil.PromisePost(arr[i].Url, data[j]);
        }
};

const _location = (req, res, next) => {
    let pos = req.body;
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;
    let url = `${getWebhookUrl}/${sn}`;
    apiUtil.PromiseGet(url).then(JSON.parse)
        .then(arr => (arr && arr.length) && doWebPush(arr, _pos))
        .catch(e => console.log(e));
    next();
};
router.get('/', getDemo);
router.post('/', _location);

module.exports = router;