// Copies users and jobs from the old MongoDB Atlas database into DynamoDB.
//
// Everyone keeps their account: users keep their MongoDB id (so login tokens
// issued before the move stay valid) and their bcrypt password hash (so
// their password still works). Running it again skips anything already copied.
//
// In backend/.env set MONGO_URI, plus USERS_TABLE, JOBS_TABLE, AWS_REGION and
// AWS credentials for the target (or DYNAMODB_ENDPOINT for DynamoDB Local). Then:
//
//   npm run copy-from-atlas -- --dry-run     (only counts what would be copied)
//   npm run copy-from-atlas
//
// Options: --db=<name> picks the MongoDB database (default: the one in
// MONGO_URI, or "test", which is what Mongoose used).

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { MongoClient } = require("mongodb");

const { dynamoClient, tables } = require("../config/aws");
const User = require("../models/User");
const Job = require("../models/Job");

const iso = (value) => (value ? new Date(value).toISOString() : undefined);
const text = (value) => (value === undefined || value === null ? "" : String(value));

const toDynamoUser = (doc) => ({
    id: doc._id.toString(),
    name: text(doc.name),
    email: text(doc.email),
    password: doc.password,
    role: doc.role || "student",
    phone: text(doc.phone),
    department: text(doc.department),
    enrollmentNumber: text(doc.enrollmentNumber),
    graduationYear: Number.isInteger(doc.graduationYear) ? doc.graduationYear : undefined,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt)
});

const toDynamoJob = (doc) => ({
    id: doc._id.toString(),
    company: text(doc.company),
    role: text(doc.role),
    description: text(doc.description),
    location: text(doc.location),
    jobType: doc.jobType,
    package: text(doc.package),
    eligibility: doc.eligibility,
    requiredSkills: Array.isArray(doc.requiredSkills) ? doc.requiredSkills.map(String) : [],
    applicationDeadline: iso(doc.applicationDeadline),
    status: doc.status,
    postedBy: doc.postedBy ? doc.postedBy.toString() : undefined,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt)
});

const copyAll = async (docs, convert, save, isDuplicate) => {
    const result = { copied: 0, skipped: 0, failed: 0 };

    for (const doc of docs) {
        try {
            await save(convert(doc));
            result.copied += 1;
        } catch (error) {
            if (isDuplicate(error)) {
                result.skipped += 1;
            } else {
                result.failed += 1;
                console.error(`  Could not copy ${doc._id}: ${error.message}`);
            }
        }
    }

    return result;
};

const main = async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const dbName = args.find((arg) => arg.startsWith("--db="))?.slice(5);

    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not set in backend/.env");
    }

    const target = process.env.DYNAMODB_ENDPOINT
        ? `DynamoDB Local at ${process.env.DYNAMODB_ENDPOINT}`
        : `AWS DynamoDB in ${await dynamoClient.config.region()}`;

    console.log(`Target: ${target}`);
    console.log(`Tables: ${tables.users}, ${tables.jobs}`);

    const client = new MongoClient(process.env.MONGO_URI);

    try {
        await client.connect();

        const mongo = dbName ? client.db(dbName) : client.db();
        console.log(`Source: MongoDB database "${mongo.databaseName}"`);

        const users = await mongo.collection("users").find().toArray();
        const jobs = await mongo.collection("jobs").find().toArray();

        console.log(`Found ${users.length} users and ${jobs.length} jobs.`);

        if (dryRun) {
            console.log("Dry run: nothing was written.");
            return;
        }

        const userResult = await copyAll(
            users,
            toDynamoUser,
            User.createUser,
            (error) => error instanceof User.DuplicateEmailError
        );

        const jobResult = await copyAll(
            jobs,
            toDynamoJob,
            Job.createJob,
            (error) => error.name === "ConditionalCheckFailedException"
        );

        console.log(`Users: ${userResult.copied} copied, ${userResult.skipped} already there, ${userResult.failed} failed.`);
        console.log(`Jobs:  ${jobResult.copied} copied, ${jobResult.skipped} already there, ${jobResult.failed} failed.`);

        if (userResult.failed || jobResult.failed) {
            process.exitCode = 1;
        }
    } finally {
        await client.close();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error("Copy failed:", error.message);
        process.exit(1);
    });
}

module.exports = { toDynamoUser, toDynamoJob };
