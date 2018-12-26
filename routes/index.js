const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send("Version : 3.1.0 - " + (process.env.Version || "0000"))
});

module.exports = router;
