// Calls the Lambda handler with the same event shape API Gateway (HTTP API)
// sends, to check the Express app works inside Lambda.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startApp } = require("./helpers");

let app;
let handler;

const event = (method, path, { query = "", headers = {}, body } = {}) => ({
    version: "2.0",
    routeKey: "$default",
    rawPath: path,
    rawQueryString: query,
    headers: {
        host: "abc123.execute-api.us-east-1.amazonaws.com",
        ...(body && { "content-type": "application/json" }),
        ...headers
    },
    requestContext: {
        accountId: "123456789012",
        apiId: "abc123",
        domainName: "abc123.execute-api.us-east-1.amazonaws.com",
        http: { method, path, protocol: "HTTP/1.1", sourceIp: "203.0.113.1", userAgent: "test" },
        requestId: "request-1",
        routeKey: "$default",
        stage: "$default",
        time: "20/Nov/2026:10:00:00 +0000",
        timeEpoch: Date.now()
    },
    body: body && JSON.stringify(body),
    isBase64Encoded: false
});

before(async () => {
    app = await startApp(); // creates the tables
    ({ handler } = require("../lambda"));
});

after(() => app.close());

test("health check", async () => {
    const response = await handler(event("GET", "/"), {});
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /CampusConnect Backend is Running/);
});

test("register and list jobs through Lambda", async () => {
    const registered = await handler(
        event("POST", "/api/auth/register", {
            body: { name: "Lambda User", email: "lambda@example.com", password: "secret1" }
        }),
        {}
    );
    assert.equal(registered.statusCode, 201);
    assert.ok(JSON.parse(registered.body).token);

    const jobs = await handler(event("GET", "/api/jobs", { query: "search=google" }), {});
    assert.equal(jobs.statusCode, 200);
    assert.deepEqual(JSON.parse(jobs.body), { count: 0, jobs: [] });
});

test("CORS preflight is answered", async () => {
    const response = await handler(
        event("OPTIONS", "/api/auth/login", {
            headers: {
                origin: "https://campusconnect.example",
                "access-control-request-method": "POST",
                "access-control-request-headers": "content-type,authorization"
            }
        }),
        {}
    );

    assert.equal(response.statusCode, 204);
    assert.equal(response.headers["access-control-allow-origin"], "*");
});
