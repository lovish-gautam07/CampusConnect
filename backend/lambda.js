
// Entry point for AWS Lambda. API Gateway sends every request here and
// serverless-http hands it to the same Express app used locally.
const serverless = require("serverless-http");

const app = require("./app");

module.exports.handler = serverless(app);
