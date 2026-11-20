// Shared test setup. Tests run against DynamoDB Local (npm run db:local),
// each test file in its own freshly created tables. S3 is mocked.

const { randomUUID } = require("crypto");

const suffix = randomUUID().slice(0, 8);

process.env.DYNAMODB_ENDPOINT = process.env.TEST_DYNAMODB_ENDPOINT || "http://localhost:8000";
process.env.AWS_REGION = "us-east-1";
process.env.AWS_ACCESS_KEY_ID = "local";
process.env.AWS_SECRET_ACCESS_KEY = "local";
delete process.env.AWS_SESSION_TOKEN;
delete process.env.AWS_PROFILE;
process.env.USERS_TABLE = `test-users-${suffix}`;
process.env.JOBS_TABLE = `test-jobs-${suffix}`;
process.env.RESUME_BUCKET = "test-resume-bucket";
process.env.JWT_SECRET = "test-jwt-secret-that-is-long-enough-1234";
process.env.ADMIN_SETUP_KEY = "test-setup-key";
process.env.ALLOWED_ORIGINS = "*";

const { createTables, deleteTables } = require("../scripts/create-local-tables");

const startApp = async () => {
    await createTables({ quiet: true });

    const app = require("../app");

    const server = await new Promise((resolve) => {
        const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });

    const base = `http://127.0.0.1:${server.address().port}`;

    const call = async (method, path, { body, token, rawBody } = {}) => {
        const response = await fetch(base + path, {
            method,
            headers: {
                ...((body || rawBody) && { "Content-Type": "application/json" }),
                ...(token && { Authorization: `Bearer ${token}` })
            },
            body: rawBody ?? (body && JSON.stringify(body))
        });

        const text = await response.text();
        let data;

        try {
            data = JSON.parse(text);
        } catch {
            data = text;
        }

        return { status: response.status, data, headers: response.headers };
    };

    const close = async () => {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
        await deleteTables();
    };

    return { base, call, close };
};

// Registers a student and returns { token, id }
const registerStudent = async (call, email, extra = {}) => {
    const response = await call("POST", "/api/auth/register", {
        body: { name: "Test Student", email, password: "secret1", ...extra }
    });

    if (response.status !== 201) {
        throw new Error(`register failed: ${response.status} ${JSON.stringify(response.data)}`);
    }

    return { token: response.data.token, id: response.data.user.id };
};

// Creates the first admin and returns { token, id }
const createAdmin = async (call, email = "admin@example.com") => {
    const created = await call("POST", "/api/auth/create-admin", {
        body: { name: "Admin", email, password: "admin-pass-1", setupKey: "test-setup-key" }
    });

    if (created.status !== 201) {
        throw new Error(`create-admin failed: ${created.status} ${JSON.stringify(created.data)}`);
    }

    const login = await call("POST", "/api/auth/login", {
        body: { email, password: "admin-pass-1" }
    });

    return { token: login.data.token, id: login.data.user.id };
};

module.exports = { startApp, registerStudent, createAdmin };
