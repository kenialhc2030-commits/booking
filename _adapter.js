const { netlifyToVercel } = require('./_adapter');
const { handler } = require('./_notify');
module.exports = async (req, res) => netlifyToVercel(handler, req, res);
