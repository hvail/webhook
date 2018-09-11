/**
 * Created by hvail on 2018/9/11.
 */
const express = require('express');
const request = require('request');
const apiBase = require('api-base-hvail');
let {util: apiUtil} = apiBase;
const area = process.env.DATAAREA || "zh-cn";

const getWebhookUrl = `http://v3.manager-redis.server.${area}.sky1088.com/sales/unit-group-hooks/field/Position`

const _location = (req, res, next) => {
    let pos = req.body;
    let _pos = pos.filter(p => p !== "null");
    let sn = _pos[0].SerialNumber;

    let url = `${getWebhookUrl}/${sn}`;
    apiUtil.PromiseGet(url).then(msg => console.log(`${url} ==> ${msg}`)).catch(e => console.log(e));

    next();
};

router.get('/');
router.post('/', _location);

module.exports = router;