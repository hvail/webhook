/***
 * 设备网络上下线推送
 * Created by hvail on 2017/10/17.
 */
const express = require('express');
const router = express.Router();

let _doPost = function (req, res, next) {
    console.log(req.body);
    res.status(200).send('1');
};

/* GET users listing. */
router.get('/', function (req, res, next) {
    res.send('respond with a resource');
});

router.post('/', _doPost);

module.exports = router;