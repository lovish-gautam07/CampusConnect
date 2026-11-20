const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startApp, registerStudent, createAdmin } = require("./helpers");

let app;

before(async () => {
    app = await startApp();
});

after(() => app.close());

test("register, duplicate email and login", async () => {
    const { call } = app;

    const registered = await call("POST", "/api/auth/register", {
        body: {
            name: "  Asha  ",
            email: " Asha@Example.com ",
            password: "secret1",
            department: "CSE",
            graduationYear: "2027"
        }
    });

    assert.equal(registered.status, 201);
    assert.ok(registered.data.token);
    assert.equal(registered.data.user.email, "asha@example.com");
    assert.equal(registered.data.user.name, "Asha");
    assert.equal(registered.data.user.role, "student");

    const duplicate = await call("POST", "/api/auth/register", {
        body: { name: "Other", email: "ASHA@example.com", password: "secret1" }
    });
    assert.equal(duplicate.status, 409);

    const shortPassword = await call("POST", "/api/auth/register", {
        body: { name: "Short", email: "short@example.com", password: "123" }
    });
    assert.equal(shortPassword.status, 400);

    const missing = await call("POST", "/api/auth/register", { body: { email: "x@example.com" } });
    assert.equal(missing.status, 400);

    const login = await call("POST", "/api/auth/login", {
        body: { email: "asha@EXAMPLE.com", password: "secret1" }
    });
    assert.equal(login.status, 200);
    assert.equal(login.data.user.id, registered.data.user.id);

    const wrongPassword = await call("POST", "/api/auth/login", {
        body: { email: "asha@example.com", password: "nope123" }
    });
    assert.equal(wrongPassword.status, 401);

    const unknown = await call("POST", "/api/auth/login", {
        body: { email: "nobody@example.com", password: "secret1" }
    });
    assert.equal(unknown.status, 401);
});

test("same email registered at the same time creates one account", async () => {
    const { call } = app;

    const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
            call("POST", "/api/auth/register", {
                body: { name: "Twin", email: "twin@example.com", password: "secret1" }
            })
        )
    );

    const created = attempts.filter((attempt) => attempt.status === 201);
    assert.equal(created.length, 1, `statuses: ${attempts.map((a) => a.status)}`);
});

test("first admin setup, student list and delete", async () => {
    const { call } = app;

    const wrongKey = await call("POST", "/api/auth/create-admin", {
        body: { name: "A", email: "a@example.com", password: "admin-pass-1", setupKey: "wrong" }
    });
    assert.equal(wrongKey.status, 403);

    const admin = await createAdmin(call);

    const secondAdmin = await call("POST", "/api/auth/create-admin", {
        body: { name: "B", email: "b@example.com", password: "admin-pass-1", setupKey: "test-setup-key" }
    });
    assert.equal(secondAdmin.status, 403);

    const newest = await registerStudent(call, "newest@example.com");

    const asStudent = await call("GET", "/api/admin/students", { token: newest.token });
    assert.equal(asStudent.status, 403);

    const noToken = await call("GET", "/api/admin/students");
    assert.equal(noToken.status, 401);

    const list = await call("GET", "/api/admin/students", { token: admin.token });
    assert.equal(list.status, 200);
    assert.equal(list.data.count, list.data.students.length);
    assert.ok(list.data.students.every((student) => student.role === "student"));
    assert.ok(list.data.students.every((student) => !("password" in student)));
    assert.equal(list.data.students[0].email, "newest@example.com", "newest first");
    assert.equal(list.data.students[0]._id, newest.id);

    const deleteAdmin = await call("DELETE", `/api/admin/students/${admin.id}`, { token: admin.token });
    assert.equal(deleteAdmin.status, 404, "admins can't be deleted as students");

    const deleteLock = await call(
        "DELETE",
        `/api/admin/students/${encodeURIComponent("EMAIL#newest@example.com")}`,
        { token: admin.token }
    );
    assert.equal(deleteLock.status, 404, "email lock items are not users");

    const deleted = await call("DELETE", `/api/admin/students/${newest.id}`, { token: admin.token });
    assert.equal(deleted.status, 200);

    const again = await call("DELETE", `/api/admin/students/${newest.id}`, { token: admin.token });
    assert.equal(again.status, 404);

    const after = await call("GET", "/api/admin/students", { token: admin.token });
    assert.equal(after.data.count, list.data.count - 1);

    // The email is free again once the account is gone
    await registerStudent(call, "newest@example.com");
});

test("bad JSON gets a 400, not a crash", async () => {
    const response = await app.call("POST", "/api/auth/login", { rawBody: "{not json" });
    assert.equal(response.status, 400);
});
