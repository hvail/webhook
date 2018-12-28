const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send("version 3.1.0.31 : " + (process.env.Version || "0000"))
});

module.exports = router;
