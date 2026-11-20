const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const { mockClient } = require("aws-sdk-client-mock");
const {
    S3Client,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand
} = require("@aws-sdk/client-s3");

const { startApp, registerStudent, createAdmin } = require("./helpers");

// S3 is faked; DynamoDB is real (DynamoDB Local)
const s3 = mockClient(S3Client);

let app;
let admin;

const fileStarting = (text, size = 2048) => {
    s3.on(HeadObjectCommand).resolves({ ContentLength: size });
    s3.on(GetObjectCommand).resolves({
        Body: { transformToString: async () => text }
    });
};

const deletedKeys = () =>
    s3.commandCalls(DeleteObjectCommand).map((call) => call.args[0].input.Key);

const uploadForm = async (token) => {
    const response = await app.call("POST", "/api/students/me/resume/upload-url", {
        token,
        body: { fileSize: 2048 }
    });
    assert.equal(response.status, 200);
    return response.data;
};

before(async () => {
    app = await startApp();
    admin = await createAdmin(app.call);
});

beforeEach(() => s3.reset());

after(() => app.close());

test("upload form is limited to the student's own PDF under 5 MB", async () => {
    const student = await registerStudent(app.call, "form@example.com");
    const form = await uploadForm(student.token);

    assert.match(form.key, new RegExp(`^resumes/${student.id}/[0-9a-f-]{36}\\.pdf$`));
    assert.match(form.url, /test-resume-bucket/);
    assert.equal(form.fields["Content-Type"], "application/pdf");
    assert.equal(form.fields.key, form.key);

    const policy = JSON.parse(Buffer.from(form.fields.Policy, "base64").toString());
    assert.deepEqual(
        policy.conditions.find((condition) => condition[0] === "content-length-range"),
        ["content-length-range", 1, 5 * 1024 * 1024]
    );
    assert.ok(policy.conditions.some((c) => c[0] === "eq" && c[1] === "$Content-Type" && c[2] === "application/pdf"));

    const tooBig = await app.call("POST", "/api/students/me/resume/upload-url", {
        token: student.token,
        body: { fileSize: 6 * 1024 * 1024 }
    });
    assert.equal(tooBig.status, 400);

    const asAdmin = await app.call("POST", "/api/students/me/resume/upload-url", { token: admin.token });
    assert.equal(asAdmin.status, 403);
});

test("saving checks ownership, existence and the PDF signature", async () => {
    const student = await registerStudent(app.call, "check@example.com");
    const other = await registerStudent(app.call, "other@example.com");
    const form = await uploadForm(student.token);
    const otherForm = await uploadForm(other.token);

    const notMine = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: otherForm.key, fileName: "x.pdf" }
    });
    assert.equal(notMine.status, 400);

    const traversal = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: `resumes/${student.id}/../${other.id}/x.pdf`, fileName: "x.pdf" }
    });
    assert.equal(traversal.status, 400);

    s3.on(HeadObjectCommand).rejects(Object.assign(new Error("NotFound"), { name: "NotFound" }));
    const missing = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: form.key, fileName: "cv.pdf" }
    });
    assert.equal(missing.status, 400);

    s3.reset();
    fileStarting("PK\u0003\u0004");
    const zip = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: form.key, fileName: "cv.pdf" }
    });
    assert.equal(zip.status, 400);
    assert.match(zip.data.message, /not a PDF/);
    assert.deepEqual(deletedKeys(), [form.key], "rejected upload is removed from S3");

    s3.reset();
    fileStarting("%PDF-", 6 * 1024 * 1024);
    const huge = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: form.key, fileName: "cv.pdf" }
    });
    assert.equal(huge.status, 400);
});

test("upload, view, replace and delete a resume", async () => {
    const student = await registerStudent(app.call, "cv@example.com");

    const first = await uploadForm(student.token);
    fileStarting("%PDF-", 4096);

    const saved = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: first.key, fileName: "My Résumé \"final\".pdf" }
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.resume.key, first.key);
    assert.equal(saved.data.resume.size, 4096);
    assert.equal(saved.data.resume.fileName, "My R_sum_ _final_.pdf");

    const mine = await app.call("GET", "/api/students/me/resume", { token: student.token });
    assert.equal(mine.status, 200);
    assert.equal(mine.data.resume.key, first.key);
    assert.match(mine.data.url, /X-Amz-Signature=/);
    assert.match(mine.data.url, /X-Amz-Expires=300/);
    assert.ok(mine.data.url.includes(first.key));

    // Replacing removes the old file
    const second = await uploadForm(student.token);
    s3.reset();
    fileStarting("%PDF-");
    const replaced = await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: second.key, fileName: "v2.pdf" }
    });
    assert.equal(replaced.status, 200);
    assert.deepEqual(deletedKeys(), [first.key]);

    // Admin sees resume details (never the password) and can open it
    const list = await app.call("GET", "/api/admin/students", { token: admin.token });
    const row = list.data.students.find((s) => s._id === student.id);
    assert.equal(row.resume.fileName, "v2.pdf");
    assert.ok(!("password" in row));

    const adminView = await app.call("GET", `/api/admin/students/${student.id}/resume`, { token: admin.token });
    assert.equal(adminView.status, 200);
    assert.ok(adminView.data.url.includes(second.key));

    const otherStudent = await registerStudent(app.call, "nocv@example.com");
    const noResume = await app.call("GET", `/api/admin/students/${otherStudent.id}/resume`, { token: admin.token });
    assert.equal(noResume.status, 404);

    const studentPeeks = await app.call("GET", `/api/admin/students/${otherStudent.id}/resume`, { token: student.token });
    assert.equal(studentPeeks.status, 403);

    // Student deletes it
    s3.reset();
    const removed = await app.call("DELETE", "/api/students/me/resume", { token: student.token });
    assert.equal(removed.status, 200);
    assert.deepEqual(deletedKeys(), [second.key]);

    const empty = await app.call("GET", "/api/students/me/resume", { token: student.token });
    assert.equal(empty.data.resume, null);
});

test("deleting a student also deletes their resume file", async () => {
    const student = await registerStudent(app.call, "leaving@example.com");
    const form = await uploadForm(student.token);
    fileStarting("%PDF-");

    await app.call("POST", "/api/students/me/resume", {
        token: student.token,
        body: { key: form.key, fileName: "cv.pdf" }
    });

    s3.reset();
    const deleted = await app.call("DELETE", `/api/admin/students/${student.id}`, { token: admin.token });
    assert.equal(deleted.status, 200);
    assert.deepEqual(deletedKeys(), [form.key]);
});
