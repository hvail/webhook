/**
 * Created by hvail on 2018/9/4.
 */
const express = require('express');
const router = express.Router();

const begin = (req, res, next) => {
    // console.log('post event begin');
    res.send("1");
    if (!Array.isArray(req.body)) {
        req.body = [req.body];
    }
    next();
};

const end = (req, res) => {
};

const error = function (err, req, res, next) {
    // set locals, only providing error in development
    console.log("event error");
    console.log(err.message);
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};
    // render the error page
    res.status(err.status || 500);
    res.render('error');
};

/* GET users listing. */
router.post('/', begin);
router.post('/', require('./webhooks'));
router.post('/', end);
router.post('/', error);

module.exports = router;