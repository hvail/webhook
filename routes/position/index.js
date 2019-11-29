/***
 * 有关轨迹的相关计算
 * 里程，
 * 围栏，
 * 高速报警，
 * WebHooks
 * Created by hvail on 2018/9/8.
 */
const express = require('express');
const router = express.Router();

let fence = require('./fence');
let webhooks = require('./webhooks');

const begin = (req, res, next) => {
    res.send("1");
    if (!Array.isArray(req.body)) {
        req.body = [req.body];
    }
    next();
};

const end = (req, res) => {
    // console.log("local end");
};

const error = function (err, req, res, next) {
    // set locals, only providing error in development
    console.log("local error");
    console.log(err.message);
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    // render the error page
    res.status(err.status || 500);
    res.render('error');
};


/* GET users listing. */
router.post('/', begin);
router.post('/', fence);
router.post('/', webhooks);
router.post('/', end);
router.post('/', error);

module.exports = router;