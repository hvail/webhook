/**
 * Created by hvail on 2018/9/4.
 */
let express = require('express');
let request = require('request');
let {util: apiUtil} = require('api-base-hvail');
const log4js = require('log4js');
let router = express.Router();

let logger = log4js.getLogger('normal');
const getWebhookUrl = `http://dealer.support.sky1088.com/device/push/Event`;

let getDemo = function (req, res, next) {
    res.send('alarm push system 1.2.0.0');
};

let reg = new RegExp("(\\d+)\\s+(.*)");
// console.log(reg.test('2025021803303227 系统通知您:设置当前可用盖章次数为50次'));
// console.log('系统通知您:设置当前可用盖章次数为50次'.replace(reg,"$2"));


const doWebPush = function (url, data) {
    for (let j = 0; j < data.length; j++) {
        if (data[j].Message) {
            let msg = data[j].Message;
            data[j].Message = msg.replace(reg, "$2");
        }
        console.log(JSON.stringify(data[j]));
        apiUtil.PromisePost(url, data[j])
            .then(ss => {
                console.log(`${url} , 200 (${JSON.stringify(ss)}) INFO : (${JSON.stringify(data[j])})`);
                logger.info(`${url} , 200 (${JSON.stringify(ss)}) INFO : (${JSON.stringify(data[j])})`);
            })
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
        doWebPush("http://hdapi.zcyxcn.com/rest/seal/addSealEvent", _pos);
    next();
};
router.get('/', getDemo);
router.post('/', _location);

module.exports = router;