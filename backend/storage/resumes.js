const { randomUUID } = require("crypto");
const {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand
} = require("@aws-sdk/client-s3");
const { createPresignedPost } = require("@aws-sdk/s3-presigned-post");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const { s3, resumeBucket } = require("../config/aws");

// Resumes live in a private S3 bucket. The browser uploads straight to S3
// with a short-lived signed form, so the file never passes through Lambda,
// and people read resumes through short-lived signed links.

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const LINK_SECONDS = 5 * 60;
const KEY_PATTERN = /^resumes\/([^/]+)\/[0-9a-f-]{36}\.pdf$/;

const bucket = () => {
    const name = resumeBucket();

    if (!name) {
        throw new Error("RESUME_BUCKET is not set.");
    }

    return name;
};

// True only for keys this student's upload form could have produced.
const isOwnKey = (userId, key) => {
    const match = typeof key === "string" && key.match(KEY_PATTERN);
    return Boolean(match) && match[1] === String(userId);
};

const createUploadForm = async (userId) => {
    const key = `resumes/${userId}/${randomUUID()}.pdf`;

    const { url, fields } = await createPresignedPost(s3, {
        Bucket: bucket(),
        Key: key,
        Conditions: [
            ["content-length-range", 1, MAX_RESUME_BYTES],
            ["eq", "$Content-Type", "application/pdf"]
        ],
        Fields: { "Content-Type": "application/pdf" },
        Expires: LINK_SECONDS
    });

    return { url, fields, key, maxBytes: MAX_RESUME_BYTES };
};

const isNotFound = (error) =>
    error.name === "NotFound" ||
    error.name === "NoSuchKey" ||
    error.$metadata?.httpStatusCode === 404;

// Checks an uploaded file before it is saved on the student's profile:
// it must exist, be small enough, and start with the PDF signature "%PDF-".
const checkUploadedResume = async (key) => {
    let head;

    try {
        head = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    } catch (error) {
        if (isNotFound(error)) return { ok: false, reason: "The upload was not found. Please try again." };
        throw error;
    }

    if (!head.ContentLength || head.ContentLength > MAX_RESUME_BYTES) {
        return { ok: false, reason: "The resume must be a PDF of 5 MB or less." };
    }

    const start = await s3.send(new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        Range: "bytes=0-4"
    }));

    const signature = await start.Body.transformToString("latin1");

    if (signature !== "%PDF-") {
        return { ok: false, reason: "That file is not a PDF." };
    }

    return { ok: true, size: head.ContentLength };
};

const deleteResumeFile = async (key) => {
    if (!key) return;

    await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
};

// Keeps file names safe to put in a download header.
const safeFileName = (name) => {
    const cleaned = String(name || "resume.pdf")
        .replace(/[^\w.\- ]+/g, "_")
        .slice(0, 100)
        .trim();

    return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || "resume"}.pdf`;
};

const createViewLink = (resume) =>
    getSignedUrl(
        s3,
        new GetObjectCommand({
            Bucket: bucket(),
            Key: resume.key,
            ResponseContentType: "application/pdf",
            ResponseContentDisposition: `inline; filename="${safeFileName(resume.fileName)}"`
        }),
        { expiresIn: LINK_SECONDS }
    );

module.exports = {
    MAX_RESUME_BYTES,
    isOwnKey,
    createUploadForm,
    checkUploadedResume,
    deleteResumeFile,
    safeFileName,
    createViewLink
};
