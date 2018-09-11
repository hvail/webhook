/**
 * Created by hvail on 2018/9/11.
 */
const express = require('express');
const request = require('request');
const apiBase = require('api-base-hvail');
let {util: apiUtil} = apiBase;
const area = process.env.DATAAREA || "zh-cn";
const router = express.Router();

const getWebhookUrl = `http://v3.manager-redis.server.${area}.sky1088.com/sales/unit-group-hooks/field/Position`

/**
 * [{"Url":"http://gps2.bagomart.com/mobile/mb_gps_trajectory.php"}]
 */

let doWebPush = function (arr, data) {
    for (let i = 0; i < arr.length; i++)
        for (let j = 0; j < data.length; j++) {
            console.log(arr[i]);
            console.log(data[j]);
            // apiUtil.PromisePost();
        }
};

const _location = (req, res, next) => {
    let pos = req.body;
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;

    let url = `${getWebhookUrl}/${sn}`;
    apiUtil.PromiseGet(url)
        .then(JSON.parse)
        .then(arr => (arr && arr.length) && doWebPush(arr, _pos))
        .catch(e => console.log(e));

    next();
};

router.get('/');
router.post('/', _location);

module.exports = router;