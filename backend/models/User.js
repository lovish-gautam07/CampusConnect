const { randomUUID } = require("crypto");
const {
    GetCommand,
    QueryCommand,
    TransactWriteCommand,
    UpdateCommand
} = require("@aws-sdk/lib-dynamodb");

const { db, tables } = require("../config/aws");

// How users are stored in the DynamoDB users table:
//
// - One item per user, keyed by `id`.
// - One "email lock" item per user, keyed by `EMAIL#<email>`, that holds the
//   user's id. DynamoDB has no unique constraint, so registration writes the
//   user and the lock in one transaction, and the transaction fails if the
//   lock already exists. Login reads the lock to find the user by email.
//   Lock items have no `role`, so they never appear in the role index.

const ROLES = ["student", "admin", "recruiter"];
const ROLE_INDEX = "role-createdAt-index";
const EMAIL_PREFIX = "EMAIL#";

class DuplicateEmailError extends Error {
    constructor() {
        super("An account with this email already exists.");
        this.name = "DuplicateEmailError";
    }
}

const normalizeEmail = (email) => String(email).toLowerCase().trim();
const emailLockId = (email) => EMAIL_PREFIX + normalizeEmail(email);

// What the API sends to the browser: never the password hash, and an `_id`
// field so the React pages written for MongoDB keep working unchanged.
const toPublic = (user) => {
    if (!user) return null;

    const { password, ...rest } = user;
    return { _id: user.id, ...rest };
};

// `id`, `createdAt` and `updatedAt` are only passed by the Atlas copy script,
// which keeps each user's original MongoDB id so existing logins still work.
const createUser = async ({ id, createdAt, updatedAt, ...fields }) => {
    const now = new Date().toISOString();

    const user = {
        ...fields,
        id: id || randomUUID(),
        email: normalizeEmail(fields.email),
        role: fields.role || "student",
        createdAt: createdAt || now,
        updatedAt: updatedAt || createdAt || now
    };

    if (!ROLES.includes(user.role)) {
        throw new Error(`Unknown role: ${user.role}`);
    }

    try {
        await db.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: tables.users,
                        Item: { id: emailLockId(user.email), userId: user.id },
                        ConditionExpression: "attribute_not_exists(id)"
                    }
                },
                {
                    Put: {
                        TableName: tables.users,
                        Item: user,
                        ConditionExpression: "attribute_not_exists(id)"
                    }
                }
            ]
        }));
    } catch (error) {
        const reasons = error.CancellationReasons || [];

        if (error.name === "TransactionCanceledException" &&
            reasons.some((reason) => reason?.Code === "ConditionalCheckFailed")) {
            throw new DuplicateEmailError();
        }

        throw error;
    }

    return user;
};

const findById = async (id) => {
    if (!id || String(id).startsWith(EMAIL_PREFIX)) return null;

    const { Item } = await db.send(new GetCommand({
        TableName: tables.users,
        Key: { id: String(id) },
        ConsistentRead: true
    }));

    return Item || null;
};

const findByEmail = async (email) => {
    const { Item: lock } = await db.send(new GetCommand({
        TableName: tables.users,
        Key: { id: emailLockId(email) },
        ConsistentRead: true
    }));

    return lock ? findById(lock.userId) : null;
};

// Newest first. Reads every page unless a limit is given.
const listByRole = async (role, { limit } = {}) => {
    const users = [];
    let ExclusiveStartKey;

    do {
        const page = await db.send(new QueryCommand({
            TableName: tables.users,
            IndexName: ROLE_INDEX,
            KeyConditionExpression: "#role = :role",
            ExpressionAttributeNames: { "#role": "role" },
            ExpressionAttributeValues: { ":role": role },
            ScanIndexForward: false,
            ExclusiveStartKey,
            ...(limit && { Limit: limit })
        }));

        users.push(...page.Items);
        ExclusiveStartKey = page.LastEvaluatedKey;
    } while (ExclusiveStartKey && (!limit || users.length < limit));

    return limit ? users.slice(0, limit) : users;
};

const adminExists = async () =>
    (await listByRole("admin", { limit: 1 })).length > 0;

// Deletes a student and their email lock together. Returns the deleted
// student, or null when the id isn't a student.
const deleteStudent = async (id) => {
    const user = await findById(id);

    if (!user || user.role !== "student") return null;

    await db.send(new TransactWriteCommand({
        TransactItems: [
            {
                Delete: {
                    TableName: tables.users,
                    Key: { id: user.id },
                    ConditionExpression: "#role = :student",
                    ExpressionAttributeNames: { "#role": "role" },
                    ExpressionAttributeValues: { ":student": "student" }
                }
            },
            {
                Delete: {
                    TableName: tables.users,
                    Key: { id: emailLockId(user.email) }
                }
            }
        ]
    }));

    return user;
};

// Saves the student's resume details, or removes them when `resume` is null.
const setResume = async (id, resume) => {
    const now = new Date().toISOString();

    const update = resume
        ? {
            UpdateExpression: "SET #resume = :resume, updatedAt = :now",
            ExpressionAttributeValues: { ":resume": resume, ":now": now, ":student": "student" }
        }
        : {
            UpdateExpression: "REMOVE #resume SET updatedAt = :now",
            ExpressionAttributeValues: { ":now": now, ":student": "student" }
        };

    await db.send(new UpdateCommand({
        TableName: tables.users,
        Key: { id: String(id) },
        ConditionExpression: "#role = :student",
        ExpressionAttributeNames: { "#role": "role", "#resume": "resume" },
        ...update
    }));
};

module.exports = {
    ROLES,
    DuplicateEmailError,
    toPublic,
    createUser,
    findById,
    findByEmail,
    listByRole,
    adminExists,
    deleteStudent,
    setResume
};
