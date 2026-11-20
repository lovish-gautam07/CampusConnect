// Checks the Atlas copy script against a throwaway MongoDB.
// Skipped unless TEST_MONGO_URI is set, for example:
//   docker run -d --rm -p 27099:27017 mongo:7
//   TEST_MONGO_URI=mongodb://localhost:27099 npm test

const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const { startApp } = require("./helpers");

const mongoUri = process.env.TEST_MONGO_URI;
const run = promisify(execFile);

let app;
let mongo;
const dbName = `cc_migrate_${Date.now()}`;

const studentId = new ObjectId();
const adminId = new ObjectId();
const jobId = new ObjectId();

const copy = (...args) =>
    run(process.execPath, [path.join(__dirname, "..", "scripts", "migrate-from-atlas.js"), `--db=${dbName}`, ...args], {
        env: { ...process.env, MONGO_URI: mongoUri }
    });

test("copies Atlas users and jobs so old logins keep working", { skip: !mongoUri && "TEST_MONGO_URI not set" }, async (t) => {
    app = await startApp();
    mongo = new MongoClient(mongoUri);
    await mongo.connect();

    t.after(async () => {
        await mongo.db(dbName).dropDatabase();
        await mongo.close();
        await app.close();
    });

    const db = mongo.db(dbName);
    const created = new Date("2026-11-01T10:00:00Z");

    await db.collection("users").insertMany([
        {
            _id: studentId,
            name: "Old Student",
            email: "old@example.com",
            password: await bcrypt.hash("oldpass1", 10),
            role: "student",
            phone: "",
            department: "ECE",
            enrollmentNumber: "21BCS001",
            graduationYear: 2026,
            createdAt: created,
            updatedAt: created
        },
        {
            _id: adminId,
            name: "Old Admin",
            email: "boss@example.com",
            password: await bcrypt.hash("adminpass1", 10),
            role: "admin",
            createdAt: created,
            updatedAt: created
        }
    ]);

    await db.collection("jobs").insertOne({
        _id: jobId,
        company: "TCS",
        role: "Analyst",
        description: "Old job",
        location: "Mumbai",
        jobType: "Full Time",
        package: "7 LPA",
        eligibility: "B.Tech",
        requiredSkills: ["Java"],
        applicationDeadline: new Date("2026-12-15T00:00:00Z"),
        status: "Open",
        postedBy: adminId,
        createdAt: created,
        updatedAt: created
    });

    const dry = await copy("--dry-run");
    assert.match(dry.stdout, /Found 2 users and 1 jobs/);
    assert.equal((await app.call("POST", "/api/auth/login", { body: { email: "old@example.com", password: "oldpass1" } })).status, 401);

    const first = await copy();
    assert.match(first.stdout, /Users: 2 copied, 0 already there, 0 failed/);
    assert.match(first.stdout, /Jobs:  1 copied, 0 already there, 0 failed/);

    // Same password, same id
    const login = await app.call("POST", "/api/auth/login", { body: { email: "old@example.com", password: "oldpass1" } });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.id, studentId.toString());

    // A token issued by the old Render backend (same secret, Mongo id) still works
    const oldAdminToken = jwt.sign({ id: adminId.toString(), role: "admin" }, process.env.JWT_SECRET);
    const students = await app.call("GET", "/api/admin/students", { token: oldAdminToken });
    assert.equal(students.status, 200);
    assert.equal(students.data.students[0].enrollmentNumber, "21BCS001");
    assert.equal(students.data.students[0].createdAt, created.toISOString());

    const jobs = await app.call("GET", "/api/jobs?search=tcs");
    assert.equal(jobs.data.count, 1);
    assert.equal(jobs.data.jobs[0]._id, jobId.toString());
    assert.equal(jobs.data.jobs[0].postedBy, adminId.toString());
    assert.equal(jobs.data.jobs[0].applicationDeadline, "2026-12-15T00:00:00.000Z");

    // The old admin counts, so no second admin can be created
    const secondAdmin = await app.call("POST", "/api/auth/create-admin", {
        body: { name: "New", email: "new@example.com", password: "admin-pass-1", setupKey: "test-setup-key" }
    });
    assert.equal(secondAdmin.status, 403);

    const again = await copy();
    assert.match(again.stdout, /Users: 0 copied, 2 already there, 0 failed/);
    assert.match(again.stdout, /Jobs:  0 copied, 1 already there, 0 failed/);
});
