const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startApp, registerStudent, createAdmin } = require("./helpers");

let app;
let admin;

const job = (overrides = {}) => ({
    company: "Google",
    role: "Software Engineer",
    description: "Build things",
    location: "Bangalore",
    package: "18 LPA",
    ...overrides
});

before(async () => {
    app = await startApp();
    admin = await createAdmin(app.call);
});

after(() => app.close());

test("only admins and recruiters can post, with validation", async () => {
    const { call } = app;
    const student = await registerStudent(call, "student@example.com");

    const asStudent = await call("POST", "/api/jobs", { token: student.token, body: job() });
    assert.equal(asStudent.status, 403);

    const missing = await call("POST", "/api/jobs", { token: admin.token, body: { company: "X" } });
    assert.equal(missing.status, 400);

    const badType = await call("POST", "/api/jobs", {
        token: admin.token,
        body: job({ jobType: "Contract" })
    });
    assert.equal(badType.status, 400);

    const badDate = await call("POST", "/api/jobs", {
        token: admin.token,
        body: job({ applicationDeadline: "not a date" })
    });
    assert.equal(badDate.status, 400);

    const posted = await call("POST", "/api/jobs", {
        token: admin.token,
        body: job({ requiredSkills: "React, Node ,", applicationDeadline: "2026-12-31" })
    });
    assert.equal(posted.status, 201);
    assert.deepEqual(posted.data.job.requiredSkills, ["React", "Node"]);
    assert.equal(posted.data.job.jobType, "Full Time");
    assert.equal(posted.data.job.status, "Open");
    assert.equal(posted.data.job.eligibility, "As per company requirements");
    assert.equal(posted.data.job.applicationDeadline, "2026-12-31T00:00:00.000Z");
    assert.equal(posted.data.job.postedBy, admin.id);
    assert.equal(posted.data.job._id, posted.data.job.id);
    assert.ok(!("companyLower" in posted.data.job));

    const fetched = await call("GET", `/api/jobs/${posted.data.job.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.job.company, "Google");

    const unknown = await call("GET", "/api/jobs/does-not-exist");
    assert.equal(unknown.status, 404);
});

test("listing is newest first and filters like before", async () => {
    const { call } = app;

    for (const extra of [
        { company: "Microsoft", role: "AI/ML Engineer", location: "Hyderabad" },
        { company: "Amazon", role: "Graduate Developer", location: "Bangalore", jobType: "Internship" },
        { company: "Infosys", role: "Systems Engineer (C++)", location: "Pune" }
    ]) {
        const response = await call("POST", "/api/jobs", { token: admin.token, body: job(extra) });
        assert.equal(response.status, 201);
    }

    const all = await call("GET", "/api/jobs");
    assert.equal(all.status, 200);
    assert.equal(all.data.count, 4);
    assert.equal(all.data.jobs[0].company, "Infosys", "newest first");
    assert.ok(all.data.jobs.every((item) => item._id));

    const names = async (query) =>
        (await call("GET", `/api/jobs?${query}`)).data.jobs.map((item) => item.company).sort();

    assert.deepEqual(await names("search=MICRO"), ["Microsoft"]);
    assert.deepEqual(await names("search=engineer"), ["Google", "Infosys", "Microsoft"]);
    assert.deepEqual(await names("location=bangal"), ["Amazon", "Google"]);
    assert.deepEqual(await names("jobType=Internship"), ["Amazon"]);
    assert.deepEqual(await names("search=engineer&location=bangalore"), ["Google"]);

    // Search text is literal, not a regular expression
    assert.deepEqual(await names(`search=${encodeURIComponent("(C++)")}`), ["Infosys"]);
    assert.deepEqual(await names(`search=${encodeURIComponent(".*")}`), []);
});
